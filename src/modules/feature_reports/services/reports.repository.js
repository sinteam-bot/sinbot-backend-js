/**
 * reports.repository.js — couche d'accès BDD
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class ReportsRepository {
    async insertReport(r) {
        const id = r.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO reports
             (id, guild_id, reporter_id, reported_id, channel_id, message_id, reason, category, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, r.guildId, r.reporterId, r.reportedId, r.channelId || null, r.messageId || null, r.reason, r.category || 'other', r.status || 'open', now]
        );
        return this.getReport(id);
    }

    async updateReport(id, fields) {
        const allowed = ['status', 'resolved_by', 'resolved_at', 'reason', 'category'];
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
            `UPDATE reports SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
    }

    async getReport(id) {
        const res = await db.pool.query(`SELECT * FROM reports WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapReport(res.rows[0]) : null;
    }

    async listReports({ guildId, status, reporterId, reportedId, limit = 50, offset = 0 } = {}) {
        const where = ['1 = 1'];
        const args = [];
        if (guildId) { args.push(guildId); where.push(`guild_id = $${args.length}`); }
        if (status) { args.push(status); where.push(`status = $${args.length}`); }
        if (reporterId) { args.push(reporterId); where.push(`reporter_id = $${args.length}`); }
        if (reportedId) { args.push(reportedId); where.push(`reported_id = $${args.length}`); }
        args.push(limit, offset);
        const sql = `SELECT * FROM reports WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`;
        const res = await db.pool.query({ text: sql, values: args });
        return (res.rows || []).map(r => this._mapReport(r));
    }

    async countByGuild(guildId, status) {
        const where = ['guild_id = $1'];
        const args = [guildId];
        if (status) { args.push(status); where.push(`status = $${args.length}`); }
        const sql = `SELECT COUNT(*)::int AS count FROM reports WHERE ${where.join(' AND ')}`;
        const res = await db.pool.query({ text: sql, values: args });
        return res.rows?.[0]?.count || 0;
    }

    async countOpenAgainstUser(guildId, reportedId) {
        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM reports WHERE guild_id = $1 AND reported_id = $2 AND status = 'open'`,
            [guildId, reportedId]
        );
        return res.rows?.[0]?.count || 0;
    }

    async lastByReporterAgainst(guildId, reporterId, reportedId) {
        const res = await db.pool.query(
            `SELECT * FROM reports WHERE guild_id = $1 AND reporter_id = $2 AND reported_id = $3 ORDER BY created_at DESC LIMIT 1`,
            [guildId, reporterId, reportedId]
        );
        return res.rows?.[0] ? this._mapReport(res.rows[0]) : null;
    }

    // =================== ACTIONS ===================

    async insertAction(a) {
        const id = a.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO report_actions
             (id, report_id, staff_id, action, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, a.reportId, a.staffId, a.action, a.notes || null, now]
        );
        return { id, ...a, createdAt: now };
    }

    async listActions(reportId) {
        const res = await db.pool.query(
            `SELECT * FROM report_actions WHERE report_id = $1 ORDER BY created_at ASC`,
            [reportId]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            reportId: r.report_id,
            staffId: r.staff_id,
            action: r.action,
            notes: r.notes,
            createdAt: r.created_at
        }));
    }

    // =================== MAPPER ===================

    _mapReport(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            reporterId: row.reporter_id,
            reportedId: row.reported_id,
            channelId: row.channel_id,
            messageId: row.message_id,
            reason: row.reason,
            category: row.category,
            status: row.status,
            resolvedBy: row.resolved_by,
            resolvedAt: row.resolved_at,
            createdAt: row.created_at
        };
    }
}

module.exports = { ReportsRepository };
