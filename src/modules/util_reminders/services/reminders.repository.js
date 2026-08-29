/**
 * reminders.repository.js — couche d'accès BDD
 *
 * Dupliqué depuis l'ancien engagement.repository.js (split Phase 9.2 du
 * plan migrate-to-c12).
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

function safeParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

class RemindersRepository {
    // =================== REMINDERS ===================

    async insertReminder(r) {
        const id = r.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO reminders
             (id, guild_id, channel_id, user_id, reminder_text, fire_at, created_at, status, source_message_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, r.guildId || null, r.channelId || null, r.userId, r.reminderText,
             r.fireAt, r.createdAt || now, r.status || 'pending', r.sourceMessageId || null]
        );
        return this.getReminder(id);
    }

    async updateReminder(id, fields) {
        const allowed = ['status', 'fire_at', 'reminder_text'];
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
            `UPDATE reminders SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
    }

    async getReminder(id) {
        const res = await db.pool.query(`SELECT * FROM reminders WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapReminder(res.rows[0]) : null;
    }

    async listReminders({ userId, status, limit = 50, offset = 0 } = {}) {
        const where = [];
        const args = [];
        if (userId) { args.push(userId); where.push(`user_id = $${args.length}`); }
        if (status) { args.push(status); where.push(`status = $${args.length}`); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        args.push(limit, offset);
        const res = await db.pool.query(
            `SELECT * FROM reminders ${whereSql} ORDER BY fire_at ASC LIMIT $${args.length - 1} OFFSET $${args.length}`,
            args
        );
        return (res.rows || []).map(r => this._mapReminder(r));
    }

    async listDueReminders(limit = 50) {
        const now = Date.now();
        const res = await db.pool.query(
            `SELECT * FROM reminders WHERE status = 'pending' AND fire_at <= $1 ORDER BY fire_at ASC LIMIT $2`,
            [now, limit]
        );
        return (res.rows || []).map(r => this._mapReminder(r));
    }

    async deleteReminder(id) {
        await db.pool.query(`DELETE FROM reminders WHERE id = $1`, [id]);
    }

}

module.exports = { RemindersRepository };
