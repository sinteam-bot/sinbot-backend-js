/**
 * src/modules/automation_scheduler/services/scheduler.repository.js
 *
 * Couche d'accès aux données pour les messages programmés.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

function safeParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

class SchedulerRepository {
    async insertScheduledMessage(data) {
        const id = data.id || newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO scheduled_messages 
             (id, guild_id, channel_id, name, content, embed_json, cron_expression, interval_minutes, next_run_at, last_run_at, enabled, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
            [
                id,
                data.guildId,
                data.channelId,
                data.name,
                data.content || null,
                data.embedJson ? (typeof data.embedJson === 'string' ? data.embedJson : JSON.stringify(data.embedJson)) : null,
                data.cronExpression || null,
                data.intervalMinutes || null,
                data.nextRunAt,
                data.lastRunAt || null,
                data.enabled === false ? 0 : 1,
                data.createdBy || null,
                now
            ]
        );

        return this.getScheduledMessage(id);
    }

    async getScheduledMessage(id) {
        const res = await db.pool.query(`SELECT * FROM scheduled_messages WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapMessage(res.rows[0]) : null;
    }

    async getScheduledMessageByName(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM scheduled_messages WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
            [guildId, name]
        );
        return res.rows?.[0] ? this._mapMessage(res.rows[0]) : null;
    }

    async listScheduledMessages(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM scheduled_messages WHERE guild_id = $1 ORDER BY next_run_at ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapMessage(r));
    }

    async listDueMessages(now = Date.now()) {
        const res = await db.pool.query(
            `SELECT * FROM scheduled_messages WHERE enabled = 1 AND next_run_at <= $1 ORDER BY next_run_at ASC LIMIT 50`,
            [now]
        );
        return (res.rows || []).map(r => this._mapMessage(r));
    }

    async updateScheduledMessage(id, fields) {
        const allowed = ['channel_id', 'name', 'content', 'embed_json', 'cron_expression', 'interval_minutes', 'next_run_at', 'last_run_at', 'enabled'];
        const setSql = [];
        const params = [];
        for (const [k, v] of Object.entries(fields)) {
            const col = k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            if (allowed.includes(col)) {
                params.push(v);
                setSql.push(`${col} = $${params.length}`);
            }
        }
        if (setSql.length === 0) return this.getScheduledMessage(id);
        params.push(Date.now(), id);
        setSql.push(`updated_at = $${params.length - 1}`);

        await db.pool.query(
            `UPDATE scheduled_messages SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
        return this.getScheduledMessage(id);
    }

    async deleteScheduledMessage(id) {
        await db.pool.query(`DELETE FROM scheduled_messages WHERE id = $1`, [id]);
    }

    _mapMessage(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            name: row.name,
            content: row.content,
            embed: safeParse(row.embed_json, null),
            embedJson: row.embed_json,
            cronExpression: row.cron_expression,
            intervalMinutes: row.interval_minutes ? Number(row.interval_minutes) : null,
            nextRunAt: Number(row.next_run_at || 0),
            lastRunAt: row.last_run_at ? Number(row.last_run_at) : null,
            enabled: Number(row.enabled) === 1,
            createdBy: row.created_by,
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { SchedulerRepository };
