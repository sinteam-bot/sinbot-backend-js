/**
 * gift.service.js — distribution descadeaux d'anniversaire
 *
 * Cadeaux supportés :
 *   - role      : ajoute un rôle Discord
 *   - xp        : ajoute de l'XP au user (utilise la BDD legacy)
 *   - money     : non implémenté en V1 (placeholder)
 *   - item      : non implémenté en V1 (placeholder)
 *   - custom    : log dans birthday_history pour distribution manuelle
 *
 * Le rôle temporaire est donné puis retiré à 00:00 le lendemain
 * (géré par BirthdayAnnouncer.cleanupTempRoles).
 */

class GiftService {
    static inject = [];

    constructor() {
        this._client = null;
    }

    setClient(client) {
        this._client = client;
    }

    /**
     * Distribue les cadeaux d'un user pour son anniversaire
     * @param {object} ctx { guild, user, config }
     * @returns {Promise<{given: string[]}>}
     */
    async give(ctx) {
        const { guild, user, config } = ctx;
        const given = [];

        // 1) Rôle temporaire (si activé)
        if (config.tempRole?.enabled && config.tempRole?.role_id) {
            try {
                const member = await guild.members.fetch(user.id).catch(() => null);
                if (member) {
                    await member.roles.add(config.tempRole.role_id);
                    given.push('role');
                }
            } catch (err) {
                console.warn(`[GiftService] temp role add failed: ${err.message}`);
            }
        }

        // 2) XP cadeau (si configuré)
        if (config.gifts?.xp_per_birthday && config.gifts.xp_per_birthday > 0) {
            try {
                const { addXP } = require('../../../db/legacy-bridge.js').xpLevel;
                await addXP(user.id, user.username, config.gifts.xp_per_birthday, 'event', `Anniversaire +${config.gifts.xp_per_birthday} XP`);
                given.push('xp');
            } catch (err) {
                console.warn(`[GiftService] XP gift failed: ${err.message}`);
            }
        }

        // 3) Cadeaux custom (placeholder)
        if (Array.isArray(config.gifts?.items)) {
            for (const item of config.gifts.items) {
                if (item.type === 'custom') {
                    given.push(`custom:${item.name || 'cadeau'}`);
                }
            }
        }

        return { given };
    }

    /**
     * Retire le rôle temporaire d'un user (cleanup à 00:00)
     */
    async removeTempRole(guild, userId, roleId) {
        try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member && member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                return true;
            }
        } catch (err) {
            console.warn(`[GiftService] removeTempRole failed: ${err.message}`);
        }
        return false;
    }

    /**
     * Formate une liste descadeaux pour le template
     */
    formatGifts(given) {
        if (!given || given.length === 0) return 'Aucun cadeau';
        return given.map(g => {
            if (g === 'role') return '🎖️ Rôle';
            if (g === 'xp') return '⭐ XP';
            if (g.startsWith('custom:')) return `🎁 ${g.slice(7)}`;
            return g;
        }).join(', ');
    }
}

module.exports = { GiftService };
