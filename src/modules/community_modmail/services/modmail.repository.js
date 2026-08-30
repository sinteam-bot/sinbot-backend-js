/**
 * src/modules/community_modmail/services/modmail.repository.js
 *
 * Couche d'accès BDD pour ModMail (threads, messages, bans, snippets).
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class ModMailRepository {
    async createThread({ guildId, userId, channelId }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO modmail_threads (id, guild_id, user_id, channel_id, status, created_at)
             VALUES ($1, $2, $3, $4, 'open', $5)`,
            [id, guildId, userId, channelId, now]
        );

        return this.getThreadById(id);
    }

    async getActiveThreadByUser(guildId, userId) {
        const res = await db.pool.query(
            `SELECT * FROM modmail_threads WHERE guild_id = $1 AND user_id = $2 AND status = 'open' LIMIT 1`,
            [guildId, userId]
        );
        return res.rows?.[0] ? this._mapThread(res.rows[0]) : null;
    }

    async getThreadByChannel(channelId) {
        const res = await db.pool.query(
            `SELECT * FROM modmail_threads WHERE channel_id = $1 AND status = 'open' LIMIT 1`,
            [channelId]
        );
        return res.rows?.[0] ? this._mapThread(res.rows[0]) : null;
    }

    async getThreadById(id) {
        const res = await db.pool.query(
            `SELECT * FROM modmail_threads WHERE id = $1 LIMIT 1`,
            [id]
        );
        return res.rows?.[0] ? this._mapThread(res.rows[0]) : null;
    }

    async closeThread(id, closedBy, reason = 'Clôturé par le staff') {
        const now = Date.now();
        await db.pool.query(
            `UPDATE modmail_threads SET status = 'closed', closed_at = $2, closed_by = $3, close_reason = $4 WHERE id = $1`,
            [id, now, closedBy, reason]
        );
        return this.getThreadById(id);
    }

    async listThreads(guildId, status = null, limit = 50) {
        let query = `SELECT * FROM modmail_threads WHERE guild_id = $1`;
        const params = [guildId];

        if (status) {
            query += ` AND status = $2 ORDER BY created_at DESC LIMIT $3`;
            params.push(status, limit);
        } else {
            query += ` ORDER BY created_at DESC LIMIT $2`;
            params.push(limit);
        }

        const res = await db.pool.query(query, params);
        return (res.rows || []).map(r => this._mapThread(r));
    }

    // =================== MESSAGES ===================

    async addMessage({ threadId, senderType, senderId, senderName, content, isAnonymous = false }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO modmail_messages (id, thread_id, sender_type, sender_id, sender_name, content, is_anonymous, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, threadId, senderType, senderId, senderName, content, isAnonymous, now]
        );

        return { id, threadId, senderType, senderId, senderName, content, isAnonymous, createdAt: now };
    }

    async getThreadMessages(threadId) {
        const res = await db.pool.query(
            `SELECT * FROM modmail_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
            [threadId]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            threadId: r.thread_id,
            senderType: r.sender_type,
            senderId: r.sender_id,
            senderName: r.sender_name,
            content: r.content,
            isAnonymous: Boolean(r.is_anonymous),
            createdAt: Number(r.created_at || 0)
        }));
    }

    // =================== BANS ===================

    async banUser(guildId, userId, reason, bannedBy) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO modmail_bans (id, guild_id, user_id, reason, banned_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by`,
            [id, guildId, userId, reason || null, bannedBy, now]
        );

        return { id, guildId, userId, reason, bannedBy, createdAt: now };
    }

    async unbanUser(guildId, userId) {
        await db.pool.query(
            `DELETE FROM modmail_bans WHERE guild_id = $1 AND user_id = $2`,
            [guildId, userId]
        );
    }

    async isUserBanned(guildId, userId) {
        const res = await db.pool.query(
            `SELECT 1 FROM modmail_bans WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
            [guildId, userId]
        );
        return Boolean(res.rows?.length);
    }

    async listBans(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM modmail_bans WHERE guild_id = $1 ORDER BY created_at DESC`,
            [guildId]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            guildId: r.guild_id,
            userId: r.user_id,
            reason: r.reason,
            bannedBy: r.banned_by,
            createdAt: Number(r.created_at || 0)
        }));
    }

    // =================== SNIPPETS ===================

    async setSnippet({ guildId, name, content, createdBy }) {
        const id = newId();
        const now = Date.now();
        const cleanName = name.toLowerCase().trim();

        await db.pool.query(
            `INSERT INTO modmail_snippets (id, guild_id, name, content, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (guild_id, name) DO UPDATE SET content = EXCLUDED.content`,
            [id, guildId, cleanName, content, createdBy, now]
        );

        return this.getSnippet(guildId, cleanName);
    }

    async getSnippet(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM modmail_snippets WHERE guild_id = $1 AND name = $2 LIMIT 1`,
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

    async listSnippets(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM modmail_snippets WHERE guild_id = $1 ORDER BY name ASC`,
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

    async deleteSnippet(guildId, name) {
        await db.pool.query(
            `DELETE FROM modmail_snippets WHERE guild_id = $1 AND name = $2`,
            [guildId, name.toLowerCase().trim()]
        );
    }

    _mapThread(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            channelId: row.channel_id,
            status: row.status,
            createdAt: Number(row.created_at || 0),
            closedAt: row.closed_at ? Number(row.closed_at) : null,
            closedBy: row.closed_by,
            closeReason: row.close_reason
        };
    }
}

module.exports = { ModMailRepository };
