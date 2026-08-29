/**
 * ticket.repository.js — couche d'accès BDD pour les tickets
 *
 * Toutes les requêtes utilisent db.pool.query pour rester compatibles
 * avec l'adaptateur mock (SQLite in-memory) utilisé en dev et dans
 * les tests.
 */

const { db } = require('../../../db/index.js');

class TicketRepository {
    async insert({ id, guildId, channelId, userId, category, subject, status, createdAt, updatedAt }) {
        await db.pool.query(
            `INSERT INTO tickets (id, guild_id, channel_id, user_id, category, subject, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, guildId, channelId, userId, category, subject, status, createdAt, updatedAt]
        );
        return { id };
    }

    async findById(id) {
        const res = await db.pool.query(
            `SELECT * FROM tickets WHERE id = $1 LIMIT 1`,
            [id]
        );
        return res.rows?.[0] ? this._map(res.rows[0]) : null;
    }

    async findByChannelId(channelId) {
        const res = await db.pool.query(
            `SELECT * FROM tickets WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [channelId]
        );
        return res.rows?.[0] ? this._map(res.rows[0]) : null;
    }

    async list({ guildId, status, userId, limit = 50, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (guildId) { params.push(guildId); where.push(`guild_id = $${params.length}`); }
        if (status) { params.push(status); where.push(`status = $${params.length}`); }
        if (userId) { params.push(userId); where.push(`user_id = $${params.length}`); }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit, offset);
        const sql = `SELECT * FROM tickets ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
        const res = await db.pool.query({ text: sql, values: params });
        return (res.rows || []).map(r => this._map(r));
    }

    async count({ guildId, status, userId } = {}) {
        const where = [];
        const params = [];
        if (guildId) { params.push(guildId); where.push(`guild_id = $${params.length}`); }
        if (status) { params.push(status); where.push(`status = $${params.length}`); }
        if (userId) { params.push(userId); where.push(`user_id = $${params.length}`); }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const sql = `SELECT COUNT(*)::int AS total FROM tickets ${whereSql}`;
        const res = await db.pool.query({ text: sql, values: params });
        return res.rows?.[0]?.total || 0;
    }

    async update(id, fields) {
        const allowed = ['status', 'claimed_by', 'closed_by', 'closed_at', 'subject', 'updated_at'];
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
            `UPDATE tickets SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
    }

    async deleteByChannelId(channelId) {
        const res = await db.pool.query(
            `DELETE FROM tickets WHERE channel_id = $1`,
            [channelId]
        );
        return res.rowCount || 0;
    }

    async insertMessage({ id, ticketId, authorId, content, attachments, isStaff, createdAt }) {
        await db.pool.query(
            `INSERT INTO ticket_messages (id, ticket_id, author_id, content, attachments, is_staff, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, ticketId, authorId, content, attachments, isStaff, createdAt]
        );
        return { id };
    }

    async findMessages(ticketId, limit = 500) {
        const res = await db.pool.query(
            `SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT $2`,
            [ticketId, limit]
        );
        return res.rows || [];
    }

    _map(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            userId: row.user_id,
            category: row.category,
            subject: row.subject,
            status: row.status,
            claimedBy: row.claimed_by,
            closedBy: row.closed_by,
            closedAt: row.closed_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

module.exports = { TicketRepository };
