/**
 * src/modules/util_timers/services/timers.repository.js
 *
 * Couche BDD pour les minuteries (Timers).
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class TimersRepository {
    async createTimer({ guildId, channelId, userId, label, durationSeconds }) {
        const id = newId();
        const now = Date.now();
        const endsAt = now + (durationSeconds * 1000);

        await db.pool.query(
            `INSERT INTO user_timers (id, guild_id, channel_id, user_id, label, duration_seconds, ends_at, notified, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)`,
            [id, guildId, channelId, userId, label || 'Minuterie', durationSeconds, endsAt, now]
        );

        return this.getTimerById(id);
    }

    async getTimerById(id) {
        const res = await db.pool.query(`SELECT * FROM user_timers WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async listUserTimers(guildId, userId) {
        const res = await db.pool.query(
            `SELECT * FROM user_timers WHERE guild_id = $1 AND user_id = $2 AND notified = false ORDER BY ends_at ASC`,
            [guildId, userId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async findDueTimers(limit = 50) {
        const now = Date.now();
        const res = await db.pool.query(
            `SELECT * FROM user_timers WHERE notified = false AND ends_at <= $1 ORDER BY ends_at ASC LIMIT $2`,
            [now, limit]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async markNotified(id) {
        await db.pool.query(`UPDATE user_timers SET notified = true WHERE id = $1`, [id]);
    }

    async deleteTimer(id, userId = null) {
        if (userId) {
            await db.pool.query(`DELETE FROM user_timers WHERE id = $1 AND user_id = $2`, [id, userId]);
        } else {
            await db.pool.query(`DELETE FROM user_timers WHERE id = $1`, [id]);
        }
    }

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            userId: row.user_id,
            label: row.label,
            durationSeconds: Number(row.duration_seconds || 0),
            endsAt: Number(row.ends_at || 0),
            notified: Boolean(row.notified),
            createdAt: Number(row.created_at || 0)
        };
    }
}

module.exports = { TimersRepository };
