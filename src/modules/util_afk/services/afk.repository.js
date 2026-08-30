/**
 * src/modules/util_afk/services/afk.repository.js
 *
 * Couche BDD pour la gestion du statut AFK.
 */

const { db } = require('../../../db/index.js');

class AfkRepository {
    async setAfk(guildId, userId, reason = null) {
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO afk_users (guild_id, user_id, reason, afk_since)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (guild_id, user_id)
             DO UPDATE SET reason = EXCLUDED.reason, afk_since = EXCLUDED.afk_since`,
            [guildId, userId, reason, now]
        );
        return this.getAfk(guildId, userId);
    }

    async getAfk(guildId, userId) {
        const res = await db.pool.query(
            `SELECT * FROM afk_users WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
            [guildId, userId]
        );
        return res.rows?.[0] ? this._mapAfk(res.rows[0]) : null;
    }

    async clearAfk(guildId, userId) {
        const current = await this.getAfk(guildId, userId);
        if (current) {
            await db.pool.query(
                `DELETE FROM afk_users WHERE guild_id = $1 AND user_id = $2`,
                [guildId, userId]
            );
        }
        return current;
    }

    async listAfk(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM afk_users WHERE guild_id = $1 ORDER BY afk_since DESC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapAfk(r));
    }

    _mapAfk(row) {
        return {
            guildId: row.guild_id,
            userId: row.user_id,
            reason: row.reason,
            afkSince: Number(row.afk_since || 0)
        };
    }
}

module.exports = { AfkRepository };
