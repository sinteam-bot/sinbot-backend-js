/**
 * src/modules/util_sticky_messages/services/sticky.repository.js
 *
 * Couche BDD pour les messages persistants (Sticky Messages).
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class StickyRepository {
    async setSticky({ guildId, channelId, content, embedJson = null, cooldownMessages = 1 }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO sticky_messages (id, guild_id, channel_id, content, embed_json, cooldown_messages, message_count_since_post, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
             ON CONFLICT (guild_id, channel_id) DO UPDATE SET
                content = EXCLUDED.content,
                embed_json = EXCLUDED.embed_json,
                cooldown_messages = EXCLUDED.cooldown_messages,
                updated_at = EXCLUDED.updated_at`,
            [id, guildId, channelId, content, embedJson ? JSON.stringify(embedJson) : null, cooldownMessages, now, now]
        );

        return this.getSticky(guildId, channelId);
    }

    async getSticky(guildId, channelId) {
        const res = await db.pool.query(
            `SELECT * FROM sticky_messages WHERE guild_id = $1 AND channel_id = $2 LIMIT 1`,
            [guildId, channelId]
        );
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async listByGuild(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM sticky_messages WHERE guild_id = $1 ORDER BY created_at ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async updateLastMessage(guildId, channelId, lastMessageId) {
        await db.pool.query(
            `UPDATE sticky_messages SET last_message_id = $3, message_count_since_post = 0 WHERE guild_id = $1 AND channel_id = $2`,
            [guildId, channelId, lastMessageId]
        );
    }

    async incrementMessageCount(guildId, channelId) {
        await db.pool.query(
            `UPDATE sticky_messages SET message_count_since_post = message_count_since_post + 1 WHERE guild_id = $1 AND channel_id = $2`,
            [guildId, channelId]
        );
    }

    async removeSticky(guildId, channelId) {
        await db.pool.query(
            `DELETE FROM sticky_messages WHERE guild_id = $1 AND channel_id = $2`,
            [guildId, channelId]
        );
    }

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            content: row.content,
            embedJson: typeof row.embed_json === 'string' ? JSON.parse(row.embed_json) : row.embed_json,
            lastMessageId: row.last_message_id,
            cooldownMessages: Number(row.cooldown_messages || 1),
            messageCountSincePost: Number(row.message_count_since_post || 0),
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { StickyRepository };
