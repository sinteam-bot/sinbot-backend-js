/**
 * src/modules/util_tags/services/tags.repository.js
 *
 * Couche BDD pour la gestion des tags.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class TagsRepository {
    async createTag({ guildId, name, content, createdBy }) {
        const id = newId();
        const now = Date.now();
        const cleanName = name.toLowerCase().trim();

        await db.pool.query(
            `INSERT INTO tags (id, guild_id, name, content, uses, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 0, $5, $6, $6)`,
            [id, guildId, cleanName, content, createdBy || null, now]
        );

        return this.getTag(guildId, cleanName);
    }

    async getTag(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM tags WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
            [guildId, name.trim()]
        );
        return res.rows?.[0] ? this._mapTag(res.rows[0]) : null;
    }

    async incrementUses(guildId, name) {
        await db.pool.query(
            `UPDATE tags SET uses = uses + 1, updated_at = $3 WHERE guild_id = $1 AND LOWER(name) = LOWER($2)`,
            [guildId, name.trim(), Date.now()]
        );
    }

    async listTags(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM tags WHERE guild_id = $1 ORDER BY uses DESC, created_at DESC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapTag(r));
    }

    async deleteTag(guildId, name) {
        await db.pool.query(
            `DELETE FROM tags WHERE guild_id = $1 AND LOWER(name) = LOWER($2)`,
            [guildId, name.trim()]
        );
    }

    _mapTag(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            name: row.name,
            content: row.content,
            uses: Number(row.uses || 0),
            createdBy: row.created_by,
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { TagsRepository };
