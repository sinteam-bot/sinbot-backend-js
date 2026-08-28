/**
 * feature_invites/services/invites.service.js
 *
 * Service métier du feature Invites (InviteLogger-like).
 *
 * Responsabilités :
 *  - Cache des invites Discord par guilde (rafraîchi sur inviteCreate/Delete)
 *  - Détection de l'inviteur lors d'un guildMemberAdd (via diff des uses)
 *  - Détection des "fake invites" (compte trop récent, pas d'avatar, etc.)
 *  - Calcul des compteurs par user (real / bonus / leaves)
 *  - Snapshots pour /restoreInvites
 *  - Blacklist
 *  - Log join/leave dans les salons configurés
 */

const { featureRegistry } = require('../../../core/feature-registry.js');
const { Injectable } = require('../../../core/index.js');
const { eq, and, isNull } = require('drizzle-orm');
const { toISOStringSafe, toDateSafe } = require('../../../utils/dateUtils.js');
const { InvitesRepository } = require('../invites.repository.js');

class InvitesService {
    static inject = [InvitesRepository];

    constructor(repository, schemaInstance = null) {
        this.repo = repository;
        this.db = repository ? repository.db : null;
        this.schema = schemaInstance || (repository ? repository.schema : null);
        this._inviteCache = new Map();
        this._memberCounter = new Map();
    }

    /**
     * Override de la connexion (utile pour les tests unitaires).
     */
    setDb(dbInstance, schemaInstance) {
        this.db = dbInstance;
        this.schema = schemaInstance || this.schema;
        this.repo.setDb(dbInstance, schemaInstance || this.repo.schema);
    }

    /**
     * Récupère la config de la feature pour une guilde, ou null si
     * désactivée. Centralise la vérification d'activation.
     */
    async _getConfig(guildId) {
        const state = await featureRegistry.get(guildId, 'invites');
        if (!state || !state.enabled) return null;
        return state.config || {};
    }

    isEnabled(config) {
        return !!config;
    }

    /**
     * Synchronise le cache d'invites depuis l'API Discord pour une guilde.
     * À appeler au démarrage du module et à chaque inviteCreate / inviteDelete.
     */
    async refreshInviteCache(guild) {
        try {
            const invites = await guild.invites.fetch();
            const map = new Map();
            for (const [code, invite] of invites) {
                map.set(code, {
                    code,
                    uses: invite.uses || 0,
                    maxUses: invite.maxUses || 0,
                    inviterId: invite.inviter?.id || null,
                    inviterUsername: invite.inviter?.username || null,
                    channelId: invite.channel?.id || null,
                    expiresAt: toISOStringSafe(invite.expiresAt),
                    createdAt: toDateSafe(invite.createdAt)?.getTime() || Date.now()
                });
                await this.repo.upsertInviteCode(code, guild.id, {
                    channelId: invite.channel?.id || null,
                    inviterId: invite.inviter?.id || null,
                    inviterUsername: invite.inviter?.username || null,
                    maxUses: invite.maxUses || 0,
                    uses: invite.uses || 0,
                    expiresAt: toISOStringSafe(invite.expiresAt),
                    createdAt: toDateSafe(invite.createdAt)?.getTime() || Date.now()
                });
            }
            this._inviteCache.set(guild.id, map);
            return map;
        } catch (e) {
            console.warn(`[InvitesService] refreshInviteCache(${guild.id}):`, e.message);
            return this._inviteCache.get(guild.id) || new Map();
        }
    }

    _getCache(guildId) {
        return this._inviteCache.get(guildId);
    }

    async onInviteCreate(guild, invite) {
        await this.repo.upsertInviteCode(invite.code, guild.id, {
            channelId: invite.channel?.id || null,
            inviterId: invite.inviter?.id || null,
            inviterUsername: invite.inviter?.username || null,
            maxUses: invite.maxUses || 0,
            uses: invite.uses || 0,
            expiresAt: toISOStringSafe(invite.expiresAt),
            createdAt: toDateSafe(invite.createdAt)?.getTime() || Date.now()
        });
        const cache = this._inviteCache.get(guild.id) || new Map();
        cache.set(invite.code, {
            code: invite.code,
            uses: invite.uses || 0,
            maxUses: invite.maxUses || 0,
            inviterId: invite.inviter?.id || null,
            inviterUsername: invite.inviter?.username || null,
            channelId: invite.channel?.id || null,
            expiresAt: Date.parse(invite.expiresAt) || null,
            createdAt: toDateSafe(invite.createdAt)?.getTime() || Date.now()
        });
        this._inviteCache.set(guild.id, cache);
    }

    async onInviteDelete(guild, code) {
        await this.repo.markInviteDeleted(code);
        const cache = this._inviteCache.get(guild.id);
        if (cache) cache.delete(code);
    }

    /**
     * Détecte l'inviteur lors d'un join, en comparant le cache des uses
     * avant et après. Retourne { inviteCode, inviterId, inviterUsername,
     * inviteUses, isVanity, isUnknown }.
     */
    async detectInviter(guild, member) {
        const isBot = member.user?.bot || member.bot;
        if (isBot) return { isBot: true };

        let before = this._getCache(guild.id);
        if (!before) {
            before = await this.refreshInviteCache(guild);
        }

        let after;
        try {
            const fetched = await guild.invites.fetch();
            after = fetched;
        } catch (e) {
            console.warn(`[InvitesService] detectInviter(${guild.id}): fetch failed:`, e.message);
            return { isUnknown: true };
        }

        let usedCode = null;
        for (const [code, invite] of after) {
            const beforeUses = before.get(code)?.uses ?? 0;
            if ((invite.uses || 0) > beforeUses) {
                usedCode = code;
                break;
            }
        }

        const isVanity = !usedCode && guild.vanityURLCode;
        if (isVanity) {
            return { isVanity: true, inviterId: null, inviterUsername: 'Vanity URL' };
        }

        if (!usedCode) {
            return { isUnknown: true };
        }

        const invite = after.get(usedCode);
        this._inviteCache.set(guild.id, after);
        await this.repo.upsertInviteCode(usedCode, guild.id, {
            channelId: invite.channel?.id || null,
            inviterId: invite.inviter?.id || null,
            inviterUsername: invite.inviter?.username || null,
            maxUses: invite.maxUses || 0,
            uses: invite.uses || 0,
            expiresAt: toISOStringSafe(invite.expiresAt),
            createdAt: toDateSafe(invite.createdAt)?.getTime() || Date.now()
        });

        return {
            isBot: false,
            isVanity: false,
            isUnknown: false,
            inviteCode: usedCode,
            inviterId: invite.inviter?.id || null,
            inviterUsername: invite.inviter?.username || null,
            inviteUses: invite.uses || 0
        };
    }

    /**
     * Détermine si un join est "fake" selon la config :
     * compte trop récent, pas d'avatar, IP dupliquée.
     */
    async detectFake(member, config) {
        const reasons = [];
        if (config.fake_no_avatar && !member.user.avatar) {
            reasons.push('no_avatar');
        }
        if (config.fake_account_threshold_days > 0) {
            const ageMs = Date.now() - member.user.createdTimestamp;
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            if (ageDays < config.fake_account_threshold_days) {
                reasons.push(`account_too_young:${Math.floor(ageDays)}d`);
            }
        }
        return reasons.length > 0
            ? { isFake: true, fakeReason: reasons.join(',') }
            : { isFake: false };
    }

    /**
     * Enregistre un join dans invite_uses et retourne la ligne créée.
     */
    async recordJoin(guild, member, detection) {
        if (detection.isBot) return null;
        if (detection.isUnknown) {
            return this.repo.recordInviteUse({
                guildId: guild.id,
                inviteCode: 'unknown',
                inviterId: 'unknown',
                inviterUsername: 'Inconnu',
                invitedId: member.id,
                invitedUsername: member.user.username,
                isVanity: 0
            });
        }
        if (detection.isVanity) {
            return this.repo.recordInviteUse({
                guildId: guild.id,
                inviteCode: guild.vanityURLCode || 'vanity',
                inviterId: 'vanity',
                inviterUsername: 'Vanity URL',
                invitedId: member.id,
                invitedUsername: member.user.username,
                isVanity: 1
            });
        }
        return this.repo.recordInviteUse({
            guildId: guild.id,
            inviteCode: detection.inviteCode,
            inviterId: detection.inviterId,
            inviterUsername: detection.inviterUsername,
            invitedId: member.id,
            invitedUsername: member.user.username,
            joinedAt: Date.now()
        });
    }

    /**
     * Enregistre un leave : marque leftAt sur la dernière ligne d'invite_uses
     * pour ce membre. Retourne l'inviterId si trouvé.
     */
    async recordLeave(guild, userId) {
        return this.repo.markLeft(guild.id, userId);
    }

    /**
     * Calcule les compteurs complets pour un utilisateur :
     *  - real : invites dont le membre invité est toujours présent
     *  - bonus : somme des bonus accordés
     *  - leaves : nb d'invités qui ont quitté
     *  - total : real + bonus
     *  - fake : nb d'invités détectés comme fake
     */
    async getUserStats(guildId, userId) {
        const [realRows, bonuses, allUses] = await Promise.all([
            this.repo.getUserInvites(guildId, userId),
            this.repo.getBonuses(guildId, userId),
            this.db.select()
                .from(this.schema.inviteUses)
                .where(and(
                    eq(this.schema.inviteUses.guildId, guildId),
                    eq(this.schema.inviteUses.inviterId, userId)
                ))
        ]);
        const real = realRows.length;
        const leaves = allUses.length - real;
        const fake = allUses.filter(u => u.isFake === 1).length;
        const bonus = bonuses.reduce((acc, b) => acc + b.amount, 0);
        return {
            real,
            bonus,
            leaves,
            fake,
            total: real + bonus
        };
    }

    /**
     * Calcule les stats pour TOUS les membres de la guilde (pour
     * /invite leaderboard). Combine le leaderboard invite_uses + les
     * bonus manuels.
     */
    async getLeaderboard(guildId, limit = 25) {
        const rows = await this.repo.getLeaderboard(guildId, limit * 2);
        const enriched = await Promise.all(rows.map(async (r) => {
            const bonuses = await this.repo.getBonuses(guildId, r.inviterId);
            const bonus = bonuses.reduce((acc, b) => acc + b.amount, 0);
            return {
                inviterId: r.inviterId,
                inviterUsername: r.inviterUsername,
                real: Number(r.count) || 0,
                bonus,
                total: (Number(r.count) || 0) + bonus
            };
        }));
        enriched.sort((a, b) => b.total - a.total);
        return enriched.slice(0, limit);
    }

    /**
     * Récupère les infos détaillées pour /invite info @user.
     */
    async getUserInfo(guildId, userId) {
        const [stats, invited, bonuses, blacklisted] = await Promise.all([
            this.getUserStats(guildId, userId),
            this.repo.getInvitedBy(guildId, userId),
            this.repo.getBonuses(guildId, userId),
            this.repo.isBlacklisted(guildId, userId)
        ]);
        return {
            stats,
            invited: invited.map(u => ({
                invitedId: u.invitedId,
                invitedUsername: u.invitedUsername,
                joinedAt: u.joinedAt,
                leftAt: u.leftAt,
                isFake: u.isFake === 1
            })),
            bonuses,
            blacklisted
        };
    }

    /**
     * Snapshot avant reset, pour permettre /invite restore.
     */
    async snapshotForReset(guildId, userId) {
        const stats = await this.getUserStats(guildId, userId);
        return this.repo.snapshotInvites(guildId, userId, {
            total: stats.total,
            real: stats.real,
            bonus: stats.bonus,
            leaves: stats.leaves
        });
    }

    async resetUser(guildId, userId) {
        await this.snapshotForReset(guildId, userId);
        await this.repo.resetAllInvites(guildId, userId);
    }

    async resetGuild(guildId) {
        const all = await this.db.select()
            .from(this.schema.inviteUses)
            .where(eq(this.schema.inviteUses.guildId, guildId));
        const userIds = [...new Set(all.map(u => u.inviterId))];
        for (const uid of userIds) {
            await this.snapshotForReset(guildId, uid);
        }
        await this.db.delete(this.schema.inviteUses)
            .where(eq(this.schema.inviteUses.guildId, guildId));
        await this.db.delete(this.schema.inviteBonuses)
            .where(eq(this.schema.inviteBonuses.guildId, guildId));
    }

    async restoreUser(guildId, userId) {
        const snap = await this.repo.getLatestSnapshot(guildId, userId);
        if (!snap) return null;
        await this.repo.resetAllInvites(guildId, userId);
        if (snap.bonusInvites > 0) {
            await this.repo.addBonus(guildId, userId, snap.bonusInvites, 'restore', null);
        }
        await this.repo.markSnapshotRestored(snap.id);
        return snap;
    }

    async restoreGuild(guildId) {
        const snaps = await this.db.select()
            .from(this.schema.inviteRestore)
            .where(and(
                eq(this.schema.inviteRestore.guildId, guildId),
                isNull(this.schema.inviteRestore.restoredAt)
            ));
        for (const s of snaps) {
            await this.restoreUser(guildId, s.userId);
        }
        return snaps.length;
    }

    async addBonus(guildId, userId, amount, reason, moderatorId) {
        return this.repo.addBonus(guildId, userId, amount, reason, moderatorId);
    }

    async addBlacklist(guildId, targetId, targetType, reason, moderatorId) {
        return this.repo.addBlacklist(guildId, targetId, targetType, reason, moderatorId);
    }

    async removeBlacklist(guildId, targetId) {
        return this.repo.removeBlacklist(guildId, targetId);
    }

    async getBlacklist(guildId) {
        return this.repo.getBlacklist(guildId);
    }

    /**
     * Formate un message de join avec les variables de template.
     */
    formatJoinMessage(template, ctx) {
        const plural = ctx.inviteUses > 1 ? 's' : '';
        return template
            .replace(/{member}/g, ctx.member)
            .replace(/{inviter}/g, ctx.inviter || 'Inconnu')
            .replace(/{invite_uses}/g, String(ctx.inviteUses))
            .replace(/{plural}/g, plural)
            .replace(/{member_number}/g, String(ctx.memberNumber))
            .replace(/{guild}/g, ctx.guild);
    }

    formatLeaveMessage(template, ctx) {
        return template
            .replace(/{member}/g, ctx.member)
            .replace(/{inviter}/g, ctx.inviter || 'Inconnu');
    }
}

module.exports = { InvitesService };
Injectable()(InvitesService.prototype);
