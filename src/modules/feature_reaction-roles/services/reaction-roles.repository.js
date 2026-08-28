/**
 * reaction-roles.repository.js — couche d'accès BDD
 *
 * Toutes les requêtes via db.pool.query (mock SQLite + PG prod).
 * Mapping row -> camelCase.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class ReactionRolesRepository {
    async insert(r) {
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO reaction_roles
             (id, guild_id, channel_id, message_id, emoji, role_id, description, mode, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [r.id, r.guildId, r.channelId, r.messageId, r.emoji, r.roleId, r.description || null, r.mode || 'toggle', now, now]
        );
        return { ...r, createdAt: now, updatedAt: now };
    }

    async update(id, fields) {
        const allowed = ['description', 'mode', 'updated_at'];
        const setSql = [];
        const params = [];
        for (const [k, v] of Object.entries(fields)) {
            const col = k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            if (allowed.includes(col)) {
                params.push(v);
                setSql.push(`${col} = $${params.length}`);
            }
        }
        if (setSql.length === 0) return;
        params.push(id);
        await db.pool.query(
            `UPDATE reaction_roles SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
    }

    async delete(id) {
        await db.pool.query(`DELETE FROM reaction_roles WHERE id = $1`, [id]);
    }

    async deleteByMessage(guildId, messageId) {
        await db.pool.query(
            `DELETE FROM reaction_roles WHERE guild_id = $1 AND message_id = $2`,
            [guildId, messageId]
        );
    }

    async findById(id) {
        const res = await db.pool.query(
            `SELECT * FROM reaction_roles WHERE id = $1 LIMIT 1`,
            [id]
        );
        return res.rows?.[0] ? this._map(res.rows[0]) : null;
    }

    async findByMessageEmoji(messageId, emoji) {
        const res = await db.pool.query(
            `SELECT * FROM reaction_roles WHERE message_id = $1 AND emoji = $2 LIMIT 1`,
            [messageId, emoji]
        );
        return res.rows?.[0] ? this._map(res.rows[0]) : null;
    }

    async listByMessage(guildId, messageId) {
        const res = await db.pool.query(
            `SELECT * FROM reaction_roles WHERE guild_id = $1 AND message_id = $2 ORDER BY created_at ASC`,
            [guildId, messageId]
        );
        return (res.rows || []).map(r => this._map(r));
    }

    async listByGuild({ guildId, limit = 100, offset = 0 } = {}) {
        const res = await db.pool.query(
            `SELECT * FROM reaction_roles WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [guildId, limit, offset]
        );
        return (res.rows || []).map(r => this._map(r));
    }

    async countByGuild(guildId) {
        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM reaction_roles WHERE guild_id = $1`,
            [guildId]
        );
        return res.rows?.[0]?.count || 0;
    }

    _map(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            messageId: row.message_id,
            emoji: row.emoji,
            roleId: row.role_id,
            description: row.description,
            mode: row.mode,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

module.exports = { ReactionRolesRepository };
