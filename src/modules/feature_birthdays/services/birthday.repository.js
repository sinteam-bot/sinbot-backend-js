/**
 * birthday.repository.js — couche d'accès BDD pour la feature Birthdays
 *
 * Toutes les requêtes via db.pool.query (compatible mock in-memory).
 * Mapping row -> camelCase pour les services.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class BirthdayRepository {
    // ============== SETTINGS (per guild) ==============

    async getSettings(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM birthday_guild_settings WHERE guild_id = $1 LIMIT 1`,
            [guildId]
        );
        return res.rows?.[0] ? this._mapSettings(res.rows[0]) : null;
    }

    async upsertSettings(s) {
        const now = Date.now();
        const existing = await this.getSettings(s.guildId);
        if (existing) {
            await db.pool.query(
                `UPDATE birthday_guild_settings
                 SET mode = $1, announce_channel_id = $2, announce_hour = $3,
                     announce_timezone = $4, ping_role_id = $5, message_template = $6,
                     temp_role_id = $7, enabled = $8, updated_at = $9
                 WHERE guild_id = $10`,
                [s.mode || 'public', s.announceChannelId || null, s.announceHour ?? 9,
                 s.announceTimezone || 'Europe/Paris', s.pingRoleId || null, s.messageTemplate,
                 s.tempRoleId || null, s.enabled === false ? 0 : 1, now, s.guildId]
            );
        } else {
            await db.pool.query(
                `INSERT INTO birthday_guild_settings
                 (guild_id, mode, announce_channel_id, announce_hour, announce_timezone, ping_role_id, message_template, temp_role_id, enabled, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [s.guildId, s.mode || 'public', s.announceChannelId || null, s.announceHour ?? 9,
                 s.announceTimezone || 'Europe/Paris', s.pingRoleId || null, s.messageTemplate,
                 s.tempRoleId || null, s.enabled === false ? 0 : 1, now, now]
            );
        }
        return this.getSettings(s.guildId);
    }

    // ============== VISIBILITY (per user per guild) ==============

    async getVisibility(userId, guildId) {
        const res = await db.pool.query(
            `SELECT * FROM birthday_visibility WHERE user_id = $1 AND guild_id = $2 LIMIT 1`,
            [userId, guildId]
        );
        return res.rows?.[0] ? { userId: res.rows[0].user_id, guildId: res.rows[0].guild_id, enabled: !!res.rows[0].enabled } : null;
    }

    async upsertVisibility(userId, guildId, enabled) {
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO birthday_visibility (user_id, guild_id, enabled, updated_at) VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, guild_id) DO UPDATE SET enabled = $3, updated_at = $4`,
            [userId, guildId, enabled ? 1 : 0, now]
        );
    }

    // ============== CHANGE LOG ==============

    async getChangeCount(userId, guildId = null) {
        let sql, args;
        if (guildId) {
            sql = `SELECT COUNT(*)::int AS count FROM birthday_change_log WHERE user_id = $1 AND guild_id = $2`;
            args = [userId, guildId];
        } else {
            sql = `SELECT COUNT(*)::int AS count FROM birthday_change_log WHERE user_id = $1 AND guild_id IS NULL`;
            args = [userId];
        }
        const res = await db.pool.query({ text: sql, values: args });
        return res.rows?.[0]?.count || 0;
    }

    async getLastChange(userId, guildId = null) {
        let sql, args;
        if (guildId) {
            sql = `SELECT * FROM birthday_change_log WHERE user_id = $1 AND guild_id = $2 ORDER BY changed_at DESC LIMIT 1`;
            args = [userId, guildId];
        } else {
            sql = `SELECT * FROM birthday_change_log WHERE user_id = $1 AND guild_id IS NULL ORDER BY changed_at DESC LIMIT 1`;
            args = [userId];
        }
        const res = await db.pool.query({ text: sql, values: args });
        return res.rows?.[0] || null;
    }

    async insertChange({ userId, guildId, changeNumber, previousBirthdate, newBirthdate, cooldownUntil }) {
        const id = newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO birthday_change_log (id, user_id, guild_id, change_number, previous_birthdate, new_birthdate, cooldown_until, changed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, userId, guildId || null, changeNumber, previousBirthdate || null, newBirthdate, cooldownUntil, now]
        );
        return { id, cooldownUntil };
    }

    // ============== HISTORY ==============

    async insertHistory({ guildId, userId, username, age, messageId, giftsGiven }) {
        const id = newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO birthday_history (id, guild_id, user_id, username, age, message_id, gifts_given, announced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, guildId, userId, username, age || null, messageId || null, giftsGiven ? JSON.stringify(giftsGiven) : null, now]
        );
        return { id };
    }

    async listHistory({ guildId, userId, limit = 50, offset = 0 } = {}) {
        const where = [];
        const args = [];
        if (guildId) { args.push(guildId); where.push(`guild_id = $${args.length}`); }
        if (userId) { args.push(userId); where.push(`user_id = $${args.length}`); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        args.push(limit, offset);
        const res = await db.pool.query(
            `SELECT * FROM birthday_history ${whereSql} ORDER BY announced_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
            args
        );
        return (res.rows || []).map(r => this._mapHistory(r));
    }

    // ============== Helpers ==============

    /**
     * Récupère tous les anniversaires du jour pour un guild.
     * En mode public, lit l'eventuelle table legacy user_birthdays.
     * En mode private, ne fait rien ici (les dates sont gérées par guild_id).
     *
     * Pour cette V1, on s'appuie sur la table legacy user_birthdays
     * (globale) et on croise avec birthday_visibility.
     */
    async listTodaysBirthdays(guildId, todayMonth, todayDay) {
        // En mode private, les anniversaires seraient dans une table par-guild.
        // Pour cette V1, on reste sur user_birthdays (legacy global).
        const res = await db.pool.query(
            `SELECT ub.user_id, ub.username, ub.birthdate, COALESCE(bv.enabled, 1) AS visibility
             FROM user_birthdays ub
             LEFT JOIN birthday_visibility bv
             ON bv.user_id = ub.user_id AND bv.guild_id = $1
             WHERE EXTRACT(MONTH FROM CAST(ub.birthdate AS DATE)) = $2
               AND EXTRACT(DAY FROM CAST(ub.birthdate AS DATE)) = $3`,
            [guildId, todayMonth, todayDay]
        );
        return (res.rows || []).map(r => ({
            userId: r.user_id,
            username: r.username,
            birthdate: r.birthdate,
            visibility: r.visibility === 1 || r.visibility === true
        }));
    }

    _mapSettings(row) {
        return {
            guildId: row.guild_id,
            mode: row.mode,
            announceChannelId: row.announce_channel_id,
            announceHour: row.announce_hour,
            announceTimezone: row.announce_timezone,
            pingRoleId: row.ping_role_id,
            messageTemplate: row.message_template,
            tempRoleId: row.temp_role_id,
            enabled: !!row.enabled,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    _mapHistory(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            username: row.username,
            age: row.age,
            messageId: row.message_id,
            giftsGiven: row.gifts_given ? safeJson(row.gifts_given, []) : [],
            announcedAt: row.announced_at
        };
    }
}

function safeJson(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = { BirthdayRepository };
