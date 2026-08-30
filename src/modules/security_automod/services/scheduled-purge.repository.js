/**
 * src/modules/security_automod/services/scheduled-purge.repository.js
 *
 * Couche BDD pour la persistance des purges programmées.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class ScheduledPurgeRepository {
    async setupPurge({ guildId, channelId, intervalHours, keepPinned = true, lastPurgeAt = 0 }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO scheduled_purges (id, guild_id, channel_id, interval_hours, keep_pinned, last_purge_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (guild_id, channel_id) DO UPDATE SET
                interval_hours = EXCLUDED.interval_hours,
                keep_pinned = EXCLUDED.keep_pinned`,
            [id, guildId, channelId, intervalHours, keepPinned, lastPurgeAt, now]
        );

        return this.getPurge(guildId, channelId);
    }

    async getPurge(guildId, channelId) {
        const res = await db.pool.query(
            `SELECT * FROM scheduled_purges WHERE guild_id = $1 AND channel_id = $2 LIMIT 1`,
            [guildId, channelId]
        );
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async listByGuild(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM scheduled_purges WHERE guild_id = $1 ORDER BY created_at ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async listAll() {
        const res = await db.pool.query(`SELECT * FROM scheduled_purges`);
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async updateLastPurge(id, timestamp = Date.now()) {
        await db.pool.query(
            `UPDATE scheduled_purges SET last_purge_at = $2 WHERE id = $1`,
            [id, timestamp]
        );
    }

    async delete(guildId, channelId) {
        await db.pool.query(
            `DELETE FROM scheduled_purges WHERE guild_id = $1 AND channel_id = $2`,
            [guildId, channelId]
        );
    }

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            intervalHours: Number(row.interval_hours || 24),
            keepPinned: Boolean(row.keep_pinned),
            lastPurgeAt: Number(row.last_purge_at || 0),
            createdAt: Number(row.created_at || 0)
        };
    }
}

module.exports = { ScheduledPurgeRepository };
