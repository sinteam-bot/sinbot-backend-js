/**
 * src/modules/community_ranks/services/ranks.repository.js
 *
 * Couche BDD pour la persistance des rangs auto-rejoignables.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class RanksRepository {
    async createRank({ guildId, roleId, name, description }) {
        const id = newId();
        const now = Date.now();
        const cleanName = name.trim().toLowerCase();

        await db.pool.query(
            `INSERT INTO ranks (id, guild_id, role_id, name, description, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, guildId, roleId, cleanName, description || null, now]
        );

        return this.getRankByName(guildId, cleanName);
    }

    async getRankByName(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM ranks WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
            [guildId, name.trim()]
        );
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async getRankByRole(guildId, roleId) {
        const res = await db.pool.query(
            `SELECT * FROM ranks WHERE guild_id = $1 AND role_id = $2 LIMIT 1`,
            [guildId, roleId]
        );
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async listRanks(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM ranks WHERE guild_id = $1 ORDER BY name ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async deleteRank(guildId, name) {
        await db.pool.query(
            `DELETE FROM ranks WHERE guild_id = $1 AND LOWER(name) = LOWER($2)`,
            [guildId, name.trim()]
        );
    }

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            roleId: row.role_id,
            name: row.name,
            description: row.description,
            createdAt: Number(row.created_at || 0)
        };
    }
}

module.exports = { RanksRepository };
