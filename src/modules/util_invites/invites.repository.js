/**
 * feature_invites/invites.repository.js
 *
 * Repository du feature Invites. Encapsule toutes les opérations Drizzle
 * sur les 5 tables (invite_codes, invite_uses, invite_bonuses,
 * invite_blacklist, invite_restore).
 */

const { eq, and, desc, asc, sql, isNull, isNotNull } = require('drizzle-orm');
const { Repository } = require('../../core/index.js');
const { db, schema } = require('../../db/index.js');
const {
    inviteCodes,
    inviteUses,
    inviteBonuses,
    inviteBlacklist,
    inviteRestore
} = require('./db/schema.js');

class InvitesRepository {
    constructor() {
        const { db: defaultDb, schema: defaultSchema } = require('../../db/index.js');
        this.db = defaultDb;
        this.schema = defaultSchema;
    }

    /**
     * Override de la connexion DB (utile pour les tests unitaires qui
     * utilisent une instance PGlite éphémère).
     */
    setDb(dbInstance, schemaInstance) {
        this.db = dbInstance;
        this.schema = schemaInstance;
    }

    // ───────────────────────── invite_codes ─────────────────────────

    async upsertInviteCode(code, guildId, data = {}, options = {}) {
        const now = Date.now();
        // Normalisation : `null || null` retournerait `""` si la valeur est
        // une chaîne vide. On utilise une fonction helper pour s'assurer
        // que seules les valeurs "vraies" (non-null, non-undefined, non-vides)
        // passent.
        const norm = (v) => {
            if (v == null) return null;
            if (typeof v === 'string' && v.trim() === '') return null;
            return v;
        };
        // Log debug des valeurs reçues si activé
        if (process.env.INVITES_DEBUG) {
            console.log('[upsertInviteCode]', {
                code, guildId,
                expiresAt_in: data.expiresAt, type: typeof data.expiresAt,
                expiresAt_norm: norm(data.expiresAt)
            });
        }

        // Garde-fou : on ne doit JAMAIS écraser un inviter humain avec le bot.
        // Discord émet `inviteCreate` avec `inviter = bot` (puisque c'est le
        // bot qui crée techniquement via `channel.createInvite` lors de
        // `/invite create`). Si une ligne existe déjà avec un inviter
        // humain (membre qui a lancé la commande), on la préserve.
        let preservedInviterId = null;
        let preservedInviterUsername = null;
        if (options.botId && data.inviterId === options.botId) {
            try {
                const existing = await this.getInviteByCode(code);
                if (existing && existing.inviterId && existing.inviterId !== options.botId) {
                    preservedInviterId = existing.inviterId;
                    preservedInviterUsername = existing.inviterUsername;
                }
            } catch {}
        }
        const finalInviterId = preservedInviterId ?? norm(data.inviterId);
        const finalInviterUsername = preservedInviterUsername ?? norm(data.inviterUsername);

        // On force les null via SQL brut pour éviter tout mapping Drizzle
        // (notamment la conversion de `null` en `""` qui peut survenir dans
        // certaines versions de PGlite/Drizzle).
        const sql = `
            INSERT INTO invite_codes (
                code, guild_id, channel_id, inviter_id, inviter_username,
                max_uses, uses, expires_at, created_at, updated_at, deleted
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (code) DO UPDATE SET
                channel_id = EXCLUDED.channel_id,
                inviter_id = EXCLUDED.inviter_id,
                inviter_username = EXCLUDED.inviter_username,
                max_uses = EXCLUDED.max_uses,
                uses = EXCLUDED.uses,
                expires_at = EXCLUDED.expires_at,
                updated_at = EXCLUDED.updated_at
            RETURNING *
        `;
        const client = this.db?.pool || this.db?._?.session?.client || this.db?.$client || (this.db && typeof this.db.query === 'function' ? this.db : null);
        if (client && typeof client.query === 'function') {
            // PGlite / pg direct
            const result = await client.query(sql, [
                code,
                guildId,
                norm(data.channelId),
                finalInviterId,
                finalInviterUsername,
                data.maxUses ?? 0,
                data.uses ?? 0,
                norm(data.expiresAt),
                data.createdAt || now,
                now,
                0
            ]);
            return result.rows?.[0] || null;
        }
        // Fallback Drizzle (devrait être inutile avec PGlite/pg)
        const [row] = await this.db.insert(inviteCodes)
            .values({
                code,
                guildId,
                channelId: norm(data.channelId),
                inviterId: finalInviterId,
                inviterUsername: finalInviterUsername,
                maxUses: data.maxUses ?? 0,
                uses: data.uses ?? 0,
                expiresAt: norm(data.expiresAt),
                createdAt: data.createdAt || now,
                updatedAt: now,
                deleted: 0
            })
            .onConflictDoUpdate({
                target: inviteCodes.code,
                set: {
                    channelId: norm(data.channelId),
                    inviterId: finalInviterId,
                    inviterUsername: finalInviterUsername,
                    maxUses: data.maxUses ?? 0,
                    uses: data.uses ?? 0,
                    expiresAt: norm(data.expiresAt),
                    updatedAt: now
                }
            })
            .returning();
        return row;
    }

    async markInviteDeleted(code) {
        await this.db.update(inviteCodes)
            .set({ deleted: 1, updatedAt: Date.now() })
            .where(eq(inviteCodes.code, code));
    }

    async getInviteCodes(guildId) {
        return this.db.select()
            .from(inviteCodes)
            .where(and(eq(inviteCodes.guildId, guildId), eq(inviteCodes.deleted, 0)));
    }

    async getInviteByCode(code) {
        const client = this.db?.pool || this.db?._?.session?.client || this.db?.$client || (this.db && typeof this.db.query === 'function' ? this.db : null);
        if (client && typeof client.query === 'function') {
            const res = await client.query('SELECT * FROM invite_codes WHERE code = $1 LIMIT 1', [code]);
            const row = res.rows?.[0];
            if (!row) return null;
            return {
                code: row.code,
                guildId: row.guild_id,
                channelId: row.channel_id,
                inviterId: row.inviter_id,
                inviterUsername: row.inviter_username,
                maxUses: row.max_uses,
                uses: row.uses,
                expiresAt: row.expires_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                deleted: row.deleted
            };
        }
        const [row] = await this.db.select()
            .from(inviteCodes)
            .where(eq(inviteCodes.code, code))
            .limit(1);
        return row || null;
    }

    // ───────────────────────── invite_uses ─────────────────────────

    async recordInviteUse(data) {
        const [row] = await this.db.insert(inviteUses)
            .values({
                id: data.id || `use_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                guildId: data.guildId,
                inviteCode: data.inviteCode,
                inviterId: data.inviterId,
                inviterUsername: data.inviterUsername || null,
                invitedId: data.invitedId,
                invitedUsername: data.invitedUsername,
                joinedAt: data.joinedAt || Date.now(),
                isFake: data.isFake ? 1 : 0,
                fakeReason: data.fakeReason || null,
                isBot: data.isBot ? 1 : 0,
                isVanity: data.isVanity ? 1 : 0
            })
            .returning();
        return row;
    }

    async getUserInvites(guildId, userId) {
        const rows = await this.db.select()
            .from(inviteUses)
            .where(and(
                eq(inviteUses.guildId, guildId),
                eq(inviteUses.inviterId, userId),
                isNull(inviteUses.leftAt)
            ));
        return rows;
    }

    async getInvitedBy(guildId, userId) {
        return this.db.select()
            .from(inviteUses)
            .where(and(
                eq(inviteUses.guildId, guildId),
                eq(inviteUses.invitedId, userId)
            ));
    }

    async getLeaderboard(guildId, limit = 25) {
        return this.db.select({
            inviterId: inviteUses.inviterId,
            inviterUsername: inviteUses.inviterUsername,
            count: sql`count(*)::int`
        })
        .from(inviteUses)
        .where(and(
            eq(inviteUses.guildId, guildId),
            isNull(inviteUses.leftAt),
            eq(inviteUses.isFake, 0)
        ))
        .groupBy(inviteUses.inviterId, inviteUses.inviterUsername)
        .orderBy(desc(sql`count(*)`))
        .limit(limit);
    }

    async markLeft(guildId, userId) {
        const [row] = await this.db.update(inviteUses)
            .set({ leftAt: Date.now() })
            .where(and(
                eq(inviteUses.guildId, guildId),
                eq(inviteUses.invitedId, userId),
                isNull(inviteUses.leftAt)
            ))
            .returning();
        return row || null;
    }

    // ───────────────────────── invite_bonuses ─────────────────────────

    async addBonus(guildId, userId, amount, reason, moderatorId) {
        const [row] = await this.db.insert(inviteBonuses)
            .values({
                id: `bonus_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                guildId,
                userId,
                amount,
                reason: reason || null,
                moderatorId: moderatorId || null,
                createdAt: Date.now()
            })
            .returning();
        return row;
    }

    async getBonuses(guildId, userId) {
        return this.db.select()
            .from(inviteBonuses)
            .where(and(eq(inviteBonuses.guildId, guildId), eq(inviteBonuses.userId, userId)));
    }

    async resetBonuses(guildId, userId) {
        await this.db.delete(inviteBonuses)
            .where(and(eq(inviteBonuses.guildId, guildId), eq(inviteBonuses.userId, userId)));
    }

    async resetAllInvites(guildId, userId) {
        await this.db.delete(inviteUses)
            .where(and(
                eq(inviteUses.guildId, guildId),
                eq(inviteUses.inviterId, userId)
            ));
        await this.resetBonuses(guildId, userId);
    }

    // ───────────────────────── invite_blacklist ─────────────────────────

    async addBlacklist(guildId, targetId, targetType, reason, moderatorId) {
        await this.db.insert(inviteBlacklist)
            .values({
                guildId, targetId, targetType,
                reason: reason || null,
                moderatorId: moderatorId || null,
                createdAt: Date.now()
            })
            .onConflictDoNothing();
    }

    async removeBlacklist(guildId, targetId) {
        await this.db.delete(inviteBlacklist)
            .where(and(eq(inviteBlacklist.guildId, guildId), eq(inviteBlacklist.targetId, targetId)));
    }

    async getBlacklist(guildId) {
        return this.db.select()
            .from(inviteBlacklist)
            .where(eq(inviteBlacklist.guildId, guildId));
    }

    async isBlacklisted(guildId, targetId) {
        const [row] = await this.db.select()
            .from(inviteBlacklist)
            .where(and(eq(inviteBlacklist.guildId, guildId), eq(inviteBlacklist.targetId, targetId)))
            .limit(1);
        return !!row;
    }

    // ───────────────────────── invite_restore ─────────────────────────

    async snapshotInvites(guildId, userId, totals) {
        const [row] = await this.db.insert(inviteRestore)
            .values({
                id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                guildId,
                userId,
                totalInvites: totals.total || 0,
                realInvites: totals.real || 0,
                bonusInvites: totals.bonus || 0,
                leaves: totals.leaves || 0,
                snapshotAt: Date.now()
            })
            .returning();
        return row;
    }

    async getLatestSnapshot(guildId, userId) {
        const [row] = await this.db.select()
            .from(inviteRestore)
            .where(and(eq(inviteRestore.guildId, guildId), eq(inviteRestore.userId, userId)))
            .orderBy(desc(inviteRestore.snapshotAt))
            .limit(1);
        return row || null;
    }

    async markSnapshotRestored(id) {
        await this.db.update(inviteRestore)
            .set({ restoredAt: Date.now() })
            .where(eq(inviteRestore.id, id));
    }
}

Repository()(InvitesRepository);

module.exports = { InvitesRepository };
