/**
 * src/modules/automation_autothread/services/autothread.repository.js
 *
 * Couche BDD pour la configuration des salons auto-thread et l'historique des fils créés.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class AutoThreadRepository {
    async setChannel({ guildId, channelId, titleFormat = '{author} - {message}', introMessage = null, slowmodeSeconds = 0, autoPin = false, enabled = true }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO autothread_channels (id, guild_id, channel_id, title_format, intro_message, slowmode_seconds, auto_pin, enabled, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (guild_id, channel_id) DO UPDATE SET
                title_format = EXCLUDED.title_format,
                intro_message = EXCLUDED.intro_message,
                slowmode_seconds = EXCLUDED.slowmode_seconds,
                auto_pin = EXCLUDED.auto_pin,
                enabled = EXCLUDED.enabled,
                updated_at = EXCLUDED.updated_at`,
            [id, guildId, channelId, titleFormat, introMessage, slowmodeSeconds, autoPin, enabled, now, now]
        );

        return this.getChannel(guildId, channelId);
    }

    async getChannel(guildId, channelId) {
        const res = await db.pool.query(
            `SELECT * FROM autothread_channels WHERE guild_id = $1 AND channel_id = $2 LIMIT 1`,
            [guildId, channelId]
        );
        return res.rows?.[0] ? this._mapChannel(res.rows[0]) : null;
    }

    async listChannels(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM autothread_channels WHERE guild_id = $1 ORDER BY created_at ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapChannel(r));
    }

    async removeChannel(guildId, channelId) {
        await db.pool.query(
            `DELETE FROM autothread_channels WHERE guild_id = $1 AND channel_id = $2`,
            [guildId, channelId]
        );
    }

    async saveThread({ guildId, parentChannelId, threadId, starterMessageId, authorId }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO autothreads (id, guild_id, parent_channel_id, thread_id, starter_message_id, author_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (thread_id) DO NOTHING`,
            [id, guildId, parentChannelId, threadId, starterMessageId, authorId, now]
        );

        return this.getThread(threadId);
    }

    async getThread(threadId) {
        const res = await db.pool.query(
            `SELECT * FROM autothreads WHERE thread_id = $1 LIMIT 1`,
            [threadId]
        );
        return res.rows?.[0] ? this._mapThread(res.rows[0]) : null;
    }

    _mapChannel(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            titleFormat: row.title_format,
            introMessage: row.intro_message,
            slowmodeSeconds: Number(row.slowmode_seconds || 0),
            autoPin: Boolean(row.auto_pin),
            enabled: Boolean(row.enabled),
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }

    _mapThread(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            parentChannelId: row.parent_channel_id,
            threadId: row.thread_id,
            starterMessageId: row.starter_message_id,
            authorId: row.author_id,
            createdAt: Number(row.created_at || 0)
        };
    }
}

module.exports = { AutoThreadRepository };
