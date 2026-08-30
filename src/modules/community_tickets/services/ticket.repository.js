/**
 * ticket.repository.js — couche d'accès BDD pour les tickets, panels, ratings et tags
 *
 * Utilise db.pool.query pour rester compatible PostgreSQL & mocks de tests.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class TicketRepository {
    async insert({ id, guildId, channelId, userId, category, subject, status, panelId = null, createdAt, updatedAt }) {
        await db.pool.query(
            `INSERT INTO tickets (id, guild_id, channel_id, user_id, category, subject, status, panel_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, guildId, channelId, userId, category, subject, status, panelId, createdAt, updatedAt]
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
        const allowed = ['status', 'claimed_by', 'closed_by', 'closed_at', 'subject', 'panel_id', 'rating_score', 'updated_at'];
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

    // =================== PANELS ===================

    async createPanel({ guildId, name, title, description = null, channelId = null, categoryId = null, roleIds = [], formQuestions = null, buttonLabel = 'Ouvrir un ticket', buttonEmoji = '📩', buttonStyle = 'Primary' }) {
        const id = newId();
        const now = Date.now();
        const cleanName = name.toLowerCase().trim();

        await db.pool.query(
            `INSERT INTO ticket_panels (id, guild_id, name, title, description, channel_id, category_id, role_ids, form_questions, button_label, button_emoji, button_style, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (guild_id, name) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                channel_id = EXCLUDED.channel_id,
                category_id = EXCLUDED.category_id,
                role_ids = EXCLUDED.role_ids,
                form_questions = EXCLUDED.form_questions,
                button_label = EXCLUDED.button_label,
                button_emoji = EXCLUDED.button_emoji,
                button_style = EXCLUDED.button_style,
                updated_at = EXCLUDED.updated_at`,
            [id, guildId, cleanName, title, description, channelId, categoryId, JSON.stringify(roleIds), formQuestions ? JSON.stringify(formQuestions) : null, buttonLabel, buttonEmoji, buttonStyle, now, now]
        );

        return this.getPanel(guildId, cleanName);
    }

    async getPanel(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM ticket_panels WHERE guild_id = $1 AND name = $2 LIMIT 1`,
            [guildId, name.toLowerCase().trim()]
        );
        return res.rows?.[0] ? this._mapPanel(res.rows[0]) : null;
    }

    async getPanelById(id) {
        const res = await db.pool.query(
            `SELECT * FROM ticket_panels WHERE id = $1 LIMIT 1`,
            [id]
        );
        return res.rows?.[0] ? this._mapPanel(res.rows[0]) : null;
    }

    async listPanels(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM ticket_panels WHERE guild_id = $1 ORDER BY created_at ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapPanel(r));
    }

    async deletePanel(guildId, name) {
        await db.pool.query(
            `DELETE FROM ticket_panels WHERE guild_id = $1 AND name = $2`,
            [guildId, name.toLowerCase().trim()]
        );
    }

    // =================== RATINGS ===================

    async addRating({ ticketId, guildId, userId, staffId = null, rating, feedback = null }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO ticket_ratings (id, ticket_id, guild_id, user_id, staff_id, rating, feedback, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (ticket_id) DO UPDATE SET rating = EXCLUDED.rating, feedback = EXCLUDED.feedback`,
            [id, ticketId, guildId, userId, staffId, rating, feedback, now]
        );

        await this.update(ticketId, { ratingScore: rating });
        return { id, ticketId, guildId, userId, staffId, rating, feedback, createdAt: now };
    }

    async getRatingStats(guildId) {
        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count, AVG(rating)::float AS average FROM ticket_ratings WHERE guild_id = $1`,
            [guildId]
        );
        return {
            count: Number(res.rows?.[0]?.count || 0),
            average: Number(res.rows?.[0]?.average || 0)
        };
    }

    async listRatings(guildId, limit = 50) {
        const res = await db.pool.query(
            `SELECT * FROM ticket_ratings WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [guildId, limit]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            ticketId: r.ticket_id,
            guildId: r.guild_id,
            userId: r.user_id,
            staffId: r.staff_id,
            rating: Number(r.rating),
            feedback: r.feedback,
            createdAt: Number(r.created_at || 0)
        }));
    }

    // =================== TAGS ===================

    async setTag({ guildId, name, content, createdBy }) {
        const id = newId();
        const now = Date.now();
        const cleanName = name.toLowerCase().trim();

        await db.pool.query(
            `INSERT INTO ticket_tags (id, guild_id, name, content, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (guild_id, name) DO UPDATE SET content = EXCLUDED.content`,
            [id, guildId, cleanName, content, createdBy, now]
        );

        return this.getTag(guildId, cleanName);
    }

    async getTag(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM ticket_tags WHERE guild_id = $1 AND name = $2 LIMIT 1`,
            [guildId, name.toLowerCase().trim()]
        );
        return res.rows?.[0] ? {
            id: res.rows[0].id,
            guildId: res.rows[0].guild_id,
            name: res.rows[0].name,
            content: res.rows[0].content,
            createdBy: res.rows[0].created_by,
            createdAt: Number(res.rows[0].created_at || 0)
        } : null;
    }

    async listTags(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM ticket_tags WHERE guild_id = $1 ORDER BY name ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            guildId: r.guild_id,
            name: r.name,
            content: r.content,
            createdBy: r.created_by,
            createdAt: Number(r.created_at || 0)
        }));
    }

    async deleteTag(guildId, name) {
        await db.pool.query(
            `DELETE FROM ticket_tags WHERE guild_id = $1 AND name = $2`,
            [guildId, name.toLowerCase().trim()]
        );
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
            closedAt: row.closed_at ? Number(row.closed_at) : null,
            panelId: row.panel_id,
            ratingScore: row.rating_score ? Number(row.rating_score) : null,
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }

    _mapPanel(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            name: row.name,
            title: row.title,
            description: row.description,
            channelId: row.channel_id,
            categoryId: row.category_id,
            roleIds: typeof row.role_ids === 'string' ? JSON.parse(row.role_ids || '[]') : (row.role_ids || []),
            formQuestions: typeof row.form_questions === 'string' ? JSON.parse(row.form_questions) : row.form_questions,
            buttonLabel: row.button_label,
            buttonEmoji: row.button_emoji,
            buttonStyle: row.button_style,
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { TicketRepository };
