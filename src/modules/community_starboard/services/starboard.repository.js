/**
 * src/modules/community_starboard/services/starboard.repository.js
 *
 * Couche d'accès aux données pour le module Starboard.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class StarboardRepository {
    async getEntry(guildId, sourceMessageId) {
        const res = await db.pool.query(
            `SELECT * FROM starboard_entries WHERE guild_id = $1 AND source_message_id = $2 LIMIT 1`,
            [guildId, sourceMessageId]
        );
        return res.rows?.[0] ? this._mapEntry(res.rows[0]) : null;
    }

    async getEntryByStarboardMessageId(guildId, starboardMessageId) {
        const res = await db.pool.query(
            `SELECT * FROM starboard_entries WHERE guild_id = $1 AND starboard_message_id = $2 LIMIT 1`,
            [guildId, starboardMessageId]
        );
        return res.rows?.[0] ? this._mapEntry(res.rows[0]) : null;
    }

    async saveEntry(entry) {
        const existing = await this.getEntry(entry.guildId, entry.sourceMessageId);
        const now = Date.now();

        if (existing) {
            const next = { ...existing, ...entry, updatedAt: now };
            await db.pool.query(
                `UPDATE starboard_entries 
                 SET starboard_message_id = $1, reaction_count = $2, starred_users = $3, updated_at = $4
                 WHERE id = $5`,
                [
                    next.starboardMessageId || null,
                    next.reactionCount || 0,
                    next.starredUsers ? JSON.stringify(next.starredUsers) : null,
                    now,
                    existing.id
                ]
            );
            return next;
        }

        const id = entry.id || newId();
        const reactionCount = entry.reactionCount || 0;
        const starredUsers = entry.starredUsers ? JSON.stringify(entry.starredUsers) : null;

        await db.pool.query(
            `INSERT INTO starboard_entries 
             (id, guild_id, source_channel_id, source_message_id, starboard_message_id, author_id, reaction_count, starred_users, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
            [
                id,
                entry.guildId,
                entry.sourceChannelId,
                entry.sourceMessageId,
                entry.starboardMessageId || null,
                entry.authorId,
                reactionCount,
                starredUsers,
                now
            ]
        );

        return this.getEntry(entry.guildId, entry.sourceMessageId);
    }

    async deleteEntry(id) {
        await db.pool.query(`DELETE FROM starboard_entries WHERE id = $1`, [id]);
    }

    async listTopEntries(guildId, limit = 10) {
        const res = await db.pool.query(
            `SELECT * FROM starboard_entries 
             WHERE guild_id = $1 
             ORDER BY reaction_count DESC, created_at DESC 
             LIMIT $2`,
            [guildId, limit]
        );
        return (res.rows || []).map(r => this._mapEntry(r));
    }

    async listEntries(guildId, { limit = 50, offset = 0 } = {}) {
        const res = await db.pool.query(
            `SELECT * FROM starboard_entries 
             WHERE guild_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2 OFFSET $3`,
            [guildId, limit, offset]
        );
        return (res.rows || []).map(r => this._mapEntry(r));
    }

    async countEntries(guildId) {
        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM starboard_entries WHERE guild_id = $1`,
            [guildId]
        );
        return res.rows?.[0]?.count || 0;
    }

    _mapEntry(row) {
        let starredUsers = [];
        try {
            if (row.starred_users) starredUsers = JSON.parse(row.starred_users);
        } catch { }

        return {
            id: row.id,
            guildId: row.guild_id,
            sourceChannelId: row.source_channel_id,
            sourceMessageId: row.source_message_id,
            starboardMessageId: row.starboard_message_id,
            authorId: row.author_id,
            reactionCount: Number(row.reaction_count || 0),
            starredUsers,
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { StarboardRepository };
