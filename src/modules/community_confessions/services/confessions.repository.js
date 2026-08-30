/**
 * src/modules/community_confessions/services/confessions.repository.js
 *
 * Couche d'accès BDD pour les confessions anonymes et bans.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class ConfessionsRepository {
    async getNextNumber(guildId) {
        const res = await db.pool.query(
            `SELECT COALESCE(MAX(number), 0) + 1 AS next_num FROM confessions WHERE guild_id = $1`,
            [guildId]
        );
        return Number(res.rows?.[0]?.next_num || 1);
    }

    async createConfession({ guildId, authorId, content, imageUrl, status = 'published', channelId = null, messageId = null, reviewMessageId = null, parentConfessionId = null }) {
        const id = newId();
        const number = await this.getNextNumber(guildId);
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO confessions (
                id, guild_id, number, author_id, content, image_url, status,
                channel_id, message_id, review_message_id, parent_confession_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
                id, guildId, number, authorId, content, imageUrl || null, status,
                channelId, messageId, reviewMessageId, parentConfessionId, now, now
            ]
        );

        return this.getConfessionById(id);
    }

    async getConfessionById(id) {
        const res = await db.pool.query(`SELECT * FROM confessions WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapConfession(res.rows[0]) : null;
    }

    async getConfessionByNumber(guildId, number) {
        const res = await db.pool.query(
            `SELECT * FROM confessions WHERE guild_id = $1 AND number = $2 LIMIT 1`,
            [guildId, parseInt(number, 10)]
        );
        return res.rows?.[0] ? this._mapConfession(res.rows[0]) : null;
    }

    async updateConfession(id, fields) {
        const allowed = ['status', 'message_id', 'review_message_id', 'channel_id'];
        const setSql = [];
        const params = [];
        let i = 1;

        for (const key of allowed) {
            const camelKey = key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
            if (fields[camelKey] !== undefined) {
                setSql.push(`${key} = $${i++}`);
                params.push(fields[camelKey]);
            }
        }

        if (setSql.length === 0) return this.getConfessionById(id);

        const now = Date.now();
        setSql.push(`updated_at = $${i++}`);
        params.push(now);

        params.push(id);
        await db.pool.query(
            `UPDATE confessions SET ${setSql.join(', ')} WHERE id = $${i}`,
            params
        );

        return this.getConfessionById(id);
    }

    async listConfessions(guildId, status = null, limit = 50) {
        let query = `SELECT * FROM confessions WHERE guild_id = $1`;
        const params = [guildId];

        if (status) {
            query += ` AND status = $2 ORDER BY created_at DESC LIMIT $3`;
            params.push(status, limit);
        } else {
            query += ` ORDER BY created_at DESC LIMIT $2`;
            params.push(limit);
        }

        const res = await db.pool.query(query, params);
        return (res.rows || []).map(r => this._mapConfession(r));
    }

    // =================== BANS ===================

    async banUser(guildId, userId, reason, bannedBy) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO confession_bans (id, guild_id, user_id, reason, banned_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by`,
            [id, guildId, userId, reason || null, bannedBy, now]
        );

        return { id, guildId, userId, reason, bannedBy, createdAt: now };
    }

    async unbanUser(guildId, userId) {
        await db.pool.query(
            `DELETE FROM confession_bans WHERE guild_id = $1 AND user_id = $2`,
            [guildId, userId]
        );
    }

    async isUserBanned(guildId, userId) {
        const res = await db.pool.query(
            `SELECT 1 FROM confession_bans WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
            [guildId, userId]
        );
        return Boolean(res.rows?.length);
    }

    async listBans(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM confession_bans WHERE guild_id = $1 ORDER BY created_at DESC`,
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

    _mapConfession(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            number: Number(row.number || 0),
            authorId: row.author_id,
            content: row.content,
            imageUrl: row.image_url,
            status: row.status,
            channelId: row.channel_id,
            messageId: row.message_id,
            reviewMessageId: row.review_message_id,
            parentConfessionId: row.parent_confession_id,
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { ConfessionsRepository };
