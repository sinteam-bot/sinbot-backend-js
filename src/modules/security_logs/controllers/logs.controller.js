/**
 * LogsController — endpoints REST pour les logs
 *
 *   GET /api/logs                  : feed paginé avec filtres
 *   GET /api/logs/types            : liste des event_types distincts
 *   WS  /ws/logs                   : live feed (broadcast)
 */

const { Controller, Get } = require('../../../core/index.js');
const { LogsService } = require('../services/logs.service.js');
const { StatsService } = require('../services/stats.service.js');
const { config } = require('../../../config/index.js');

function resolveGuildId(req) {
    if (req?.query?.guild_id) return req.query.guild_id;
    if (process.env.GUILD_ID) return process.env.GUILD_ID;
    if (process.env.NODE_ENV !== 'test' && config.discord?.guild_id) return config.discord.guild_id;
    return null;
}

class LogsController {
    static inject = [LogsService, StatsService];

    constructor (logs, stats) {
        this.logs = logs;
        this.stats = stats;
    }

    async listLogs(req) {
        try {
            const guildId = resolveGuildId(req);
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const data = await this.logs.list({
                guildId,
                eventType: req.query.event_type || null,
                actorId: req.query.actor_id || null,
                targetId: req.query.target_id || null,
                channelId: req.query.channel_id || null,
                page: parseInt(req.query.page) || 1,
                limit: Math.min(parseInt(req.query.limit) || 50, 200)
            });
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async listTypes(req) {
        try {
            const { pool } = require('../../../db/index.js');
            const guildId = resolveGuildId(req);
            const where = guildId ? `WHERE guild_id = $1` : '';
            const args = guildId ? [guildId] : [];
            const res = await pool.query(
                `SELECT event_type, COUNT(*)::int AS count FROM event_log ${where} GROUP BY event_type ORDER BY count DESC`,
                args
            );
            return { success: true, data: res.rows || [] };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async overview(req) {
        try {
            const guildId = resolveGuildId(req);
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const data = await this.stats.overview(guildId);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async messagesByDay(req) {
        try {
            const guildId = resolveGuildId(req);
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const days = Math.min(parseInt(req.query.days) || 7, 90);
            const data = await this.stats.messagesByDay(guildId, days);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async memberGrowth(req) {
        try {
            const guildId = resolveGuildId(req);
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const days = Math.min(parseInt(req.query.days) || 30, 90);
            const data = await this.stats.memberGrowth(guildId, days);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async moderationStats(req) {
        try {
            const guildId = resolveGuildId(req);
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const weeks = Math.min(parseInt(req.query.weeks) || 4, 12);
            const data = await this.stats.moderationByWeek(guildId, weeks);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/logs')(LogsController);
Get('/')(LogsController.prototype, 'listLogs');
Get('/types')(LogsController.prototype, 'listTypes');

module.exports = { LogsController };
