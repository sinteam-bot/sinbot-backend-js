/**
 * src/modules/util_highlights/services/highlights.repository.js
 *
 * Couche BDD pour les alertes mots-clés (Highlights).
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class HighlightsRepository {
    async addKeyword(guildId, userId, keyword) {
        const id = newId();
        const now = Date.now();
        const norm = keyword.toLowerCase().trim();

        await db.pool.query(
            `INSERT INTO user_highlights (id, guild_id, user_id, keyword, created_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (guild_id, user_id, keyword) DO NOTHING`,
            [id, guildId, userId, norm, now]
        );

        return { id, guildId, userId, keyword: norm, createdAt: now };
    }

    async removeKeyword(guildId, userId, keyword) {
        const norm = keyword.toLowerCase().trim();
        await db.pool.query(
            `DELETE FROM user_highlights WHERE guild_id = $1 AND user_id = $2 AND keyword = $3`,
            [guildId, userId, norm]
        );
    }

    async listUserKeywords(guildId, userId) {
        const res = await db.pool.query(
            `SELECT * FROM user_highlights WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at ASC`,
            [guildId, userId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async listGuildKeywords(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM user_highlights WHERE guild_id = $1`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            keyword: row.keyword,
            createdAt: Number(row.created_at || 0)
        };
    }
}

module.exports = { HighlightsRepository };
