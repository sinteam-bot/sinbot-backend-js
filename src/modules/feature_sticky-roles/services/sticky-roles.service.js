/**
 * sticky-roles.service.js — logique métier des rôles sticky
 *
 * - addRole(guildId, userId, roleId) : ajoute à la BDD
 * - removeRole(guildId, userId, roleId)
 * - clearForUser(guildId, userId)
 * - listForUser(guildId, userId)
 * - snapshotOnLeave(guild, member) : à appeler depuis le listener
 *   guildMemberRemove pour capturer les rôles du member
 * - restoreOnJoin(guild, member) : à appeler depuis le listener
 *   guildMemberAdd pour re-attribuer les rôles persistés
 */

const { Injectable } = require('../../../core/index.js');
const { StickyRolesRepository } = require('./sticky-roles.repository.js');

class StickyRolesService {
    static inject = [StickyRolesRepository];

    constructor(repo) {
        this.repo = repo;
        this._client = null;
    }

    setClient(client) {
        this._client = client;
    }

    async listForUser(guildId, userId) {
        return this.repo.listForUser(guildId, userId);
    }

    async addRole(guildId, userId, roleId, config) {
        const count = await this.repo.countForUser(guildId, userId);
        if (count >= (config.max_per_user || 10)) {
            return { ok: false, error: 'max_per_user_reached' };
        }
        await this.repo.saveRoles(guildId, userId, [roleId]);
        return { ok: true };
    }

    async removeRole(guildId, userId, roleId) {
        await this.repo.removeRole(guildId, userId, roleId);
        return { ok: true };
    }

    async clearForUser(guildId, userId) {
        await this.repo.clear(guildId, userId);
        return { ok: true };
    }

    /**
     * Capture les rôles d'un member qui quitte (sauf @everyone et roles > bot)
     */
    async snapshotOnLeave(guild, member) {
        try {
            if (!member || !member.roles || !member.roles.cache) return { ok: true, saved: 0 };
            const botMember = await guild.members.fetchMe().catch(() => null);
            const botHighest = botMember?.roles?.highest?.position ?? 0;

            const roles = Array.from(member.roles.cache.values());
            const sticky = roles
                .filter(r => r.id !== guild.id) // pas @everyone
                .filter(r => r.position < botHighest) // pas au-dessus du bot
                .map(r => r.id);
            if (sticky.length === 0) return { ok: true, saved: 0 };

            await this.repo.saveRoles(guild.id, member.id, sticky);
            return { ok: true, saved: sticky.length };
        } catch (err) {
            console.warn(`[StickyRoles] snapshot failed: ${err.message}`);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Re-attribue les rôles sticky d'un member qui revient
     */
    async restoreOnJoin(guild, member, config) {
        try {
            const list = await this.repo.listForUser(guild.id, member.id);
            if (list.length === 0) return { ok: true, restored: 0 };

            const botMember = await guild.members.fetchMe().catch(() => null);
            const botHighest = botMember?.roles?.highest?.position ?? 0;
            const guildRoles = await guild.roles.fetch().catch(() => null);
            if (!guildRoles) return { ok: false, error: 'cannot_fetch_roles' };

            const memberRoleIds = new Set(member.roles.cache ? Array.from(member.roles.cache.keys()) : []);

            let restored = 0;
            for (const entry of list) {
                const role = guildRoles.get(entry.roleId);
                if (!role) {
                    // Role supprimé entre temps — on nettoie
                    await this.repo.removeRole(guild.id, member.id, entry.roleId);
                    continue;
                }
                if (role.position >= botHighest) continue; // trop haut pour le bot
                if (memberRoleIds.has(entry.roleId)) continue; // déjà dessus
                try {
                    await member.roles.add(entry.roleId);
                    restored++;
                } catch (err) {
                    console.warn(`[StickyRoles] restore role ${entry.roleId} failed: ${err.message}`);
                }
            }
            return { ok: true, restored };
        } catch (err) {
            console.warn(`[StickyRoles] restore failed: ${err.message}`);
            return { ok: false, error: err.message };
        }
    }
}

Injectable()(StickyRolesService);

module.exports = { StickyRolesService };
