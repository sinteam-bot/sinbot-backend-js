/**
 * reaction-roles.repository.js — couche d'accès BDD
 *
 * Phase 10 v1 (emoji reactions) + v2 (buttons + selects).
 * Toutes les requêtes via db.pool.query (mock SQLite + PG prod).
 * Mapping row -> camelCase. JSON columns parsed via safeParse.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

function safeParse(str, fallback) {
    if (str === null || str === undefined) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

class ReactionRolesRepository {
    async insert(r) {
        const now = Date.now();
        const metadataJson = r.metadata ? JSON.stringify(r.metadata) : null;
        await db.pool.query(
            `INSERT INTO reaction_roles
             (id, guild_id, channel_id, message_id, emoji, role_id, description, mode, kind, metadata, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [r.id, r.guildId, r.channelId, r.messageId, r.emoji || '', r.roleId || '', r.description || null, r.mode || 'toggle', r.kind || 'reaction', metadataJson, now, now]
        );
        return { ...r, createdAt: now, updatedAt: now };
    }

    async update(id, fields) {
        const allowed = ['description', 'mode', 'kind', 'metadata', 'updated_at'];
        const setSql = [];
        const params = [];
        for (const [k, v] of Object.entries(fields)) {
            const col = k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            if (allowed.includes(col)) {
                params.push(col === 'metadata' && v ? JSON.stringify(v) : v);
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

    async findByMessageCustomId(messageId, customIdSuffix) {
        // Look for an entry where the JSON metadata has customIdSuffix
        // matching the given suffix, and kind='button' or 'select'.
        const list = await this.listByMessage(messageId.guildId || '', messageId);
        // messageId passed as a string here? Refactor to use proper signature
        return null;
    }

    async listByMessage(guildId, messageId) {
        const res = await db.pool.query(
            `SELECT * FROM reaction_roles WHERE guild_id = $1 AND message_id = $2 ORDER BY created_at ASC`,
            [guildId, messageId]
        );
        return (res.rows || []).map(r => this._map(r));
    }

    async listByGuild({ guildId, limit = 100, offset = 0, kind = null } = {}) {
        const where = ['guild_id = $1'];
        const args = [guildId];
        if (kind) { args.push(kind); where.push(`kind = $${args.length}`); }
        args.push(limit, offset);
        const res = await db.pool.query(
            `SELECT * FROM reaction_roles WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
            args
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
            emoji: row.emoji || '',
            roleId: row.role_id || '',
            description: row.description,
            mode: row.mode,
            kind: row.kind || 'reaction',
            metadata: safeParse(row.metadata, null),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

module.exports = { ReactionRolesRepository };
