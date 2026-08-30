/**
 * src/modules/community_timed_roles/services/timed-roles.repository.js
 *
 * Couche BDD pour la persistance des rôles temporisés.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class TimedRolesRepository {
    async insertTimedRole({ guildId, userId, roleId, expiresAt }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO timed_roles (id, guild_id, user_id, role_id, expires_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, guildId, userId, roleId, expiresAt, now]
        );

        return this.getTimedRole(id);
    }

    async getTimedRole(id) {
        const res = await db.pool.query(`SELECT * FROM timed_roles WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async findActive(guildId, userId, roleId) {
        const res = await db.pool.query(
            `SELECT * FROM timed_roles WHERE guild_id = $1 AND user_id = $2 AND role_id = $3 LIMIT 1`,
            [guildId, userId, roleId]
        );
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async listExpired(now = Date.now()) {
        const res = await db.pool.query(
            `SELECT * FROM timed_roles WHERE expires_at <= $1 LIMIT 100`,
            [now]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async listByUser(guildId, userId) {
        const res = await db.pool.query(
            `SELECT * FROM timed_roles WHERE guild_id = $1 AND user_id = $2 ORDER BY expires_at ASC`,
            [guildId, userId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async listByGuild(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM timed_roles WHERE guild_id = $1 ORDER BY expires_at ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async delete(id) {
        await db.pool.query(`DELETE FROM timed_roles WHERE id = $1`, [id]);
    }

    async deleteByRole(guildId, userId, roleId) {
        await db.pool.query(
            `DELETE FROM timed_roles WHERE guild_id = $1 AND user_id = $2 AND role_id = $3`,
            [guildId, userId, roleId]
        );
    }

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            roleId: row.role_id,
            expiresAt: Number(row.expires_at || 0),
            createdAt: Number(row.created_at || 0)
        };
    }
}

module.exports = { TimedRolesRepository };
