/**
 * engagement.repository.js — couche d'accès BDD unifiée pour
 * reminders + word_triggers + custom_commands
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

function safeParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

class EngagementAdvancedRepository {
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

    // =================== WORD TRIGGERS ===================

    async insertTrigger(t) {
        const id = t.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO word_triggers
             (id, guild_id, trigger_text, match_type, response_text, response_embed_json, exclude_channel_ids_json, exclude_role_ids_json, cooldown_seconds, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
            [id, t.guildId, t.triggerText, t.matchType || 'exact',
             t.responseText || null, t.responseEmbedJson || null,
             t.excludeChannelIdsJson || null, t.excludeRoleIdsJson || null,
             t.cooldownSeconds ?? 10, t.createdBy || null, now]
        );
        return this.getTrigger(id);
    }

    async getTrigger(id) {
        const res = await db.pool.query(`SELECT * FROM word_triggers WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapTrigger(res.rows[0]) : null;
    }

    async listTriggers(guildId, limit = 100) {
        const res = await db.pool.query(
            `SELECT * FROM word_triggers WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [guildId, limit]
        );
        return (res.rows || []).map(r => this._mapTrigger(r));
    }

    async deleteTrigger(id) {
        await db.pool.query(`DELETE FROM word_triggers WHERE id = $1`, [id]);
    }

    // =================== CUSTOM COMMANDS ===================

    async insertCustomCommand(c) {
        const id = c.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO custom_commands
             (id, guild_id, name, response_text, response_embed_json, restrict_channel_ids_json, restrict_role_ids_json, cooldown_seconds, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, c.guildId, c.name, c.responseText || null, c.responseEmbedJson || null,
             c.restrictChannelIdsJson || null, c.restrictRoleIdsJson || null,
             c.cooldownSeconds ?? 5, c.createdBy || null, now]
        );
        return this.getCustomCommand(id);
    }

    async getCustomCommand(id) {
        const res = await db.pool.query(`SELECT * FROM custom_commands WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapCustomCommand(res.rows[0]) : null;
    }

    async getCustomCommandByName(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM custom_commands WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
            [guildId, name]
        );
        return res.rows?.[0] ? this._mapCustomCommand(res.rows[0]) : null;
    }

    async listCustomCommands(guildId, limit = 100) {
        const res = await db.pool.query(
            `SELECT * FROM custom_commands WHERE guild_id = $1 ORDER BY name ASC LIMIT $2`,
            [guildId, limit]
        );
        return (res.rows || []).map(r => this._mapCustomCommand(r));
    }

    async deleteCustomCommand(id) {
        await db.pool.query(`DELETE FROM custom_commands WHERE id = $1`, [id]);
    }

    // =================== COOLDOWNS (in-memory, pas en BDD pour V1) ===================
    // Les cooldowns sont gérés en mémoire via une Map (par trigger/cmd).
    // Cela évite une colonne `last_used_at` et un cron de purge.
    // Tradeoff : reset si le bot redémarre. Acceptable pour V1.

    // =================== MAP ===================

    _mapReminder(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            userId: row.user_id,
            reminderText: row.reminder_text,
            fireAt: row.fire_at,
            createdAt: row.created_at,
            status: row.status,
            sourceMessageId: row.source_message_id
        };
    }

    _mapTrigger(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            triggerText: row.trigger_text,
            matchType: row.match_type,
            responseText: row.response_text,
            responseEmbed: row.response_embed_json ? safeParse(row.response_embed_json, null) : null,
            excludeChannelIds: row.exclude_channel_ids_json ? safeParse(row.exclude_channel_ids_json, []) : [],
            excludeRoleIds: row.exclude_role_ids_json ? safeParse(row.exclude_role_ids_json, []) : [],
            cooldownSeconds: row.cooldown_seconds,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    _mapCustomCommand(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            name: row.name,
            responseText: row.response_text,
            responseEmbed: row.response_embed_json ? safeParse(row.response_embed_json, null) : null,
            restrictChannelIds: row.restrict_channel_ids_json ? safeParse(row.restrict_channel_ids_json, []) : [],
            restrictRoleIds: row.restrict_role_ids_json ? safeParse(row.restrict_role_ids_json, []) : [],
            cooldownSeconds: row.cooldown_seconds,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

module.exports = { EngagementAdvancedRepository, EngagementRepository: EngagementAdvancedRepository };
