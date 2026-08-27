/**
 * AutomodController — endpoints REST pour la modération
 *
 *   GET  /api/automod/logs?guild_id=&user_id=&action=&page=&limit=
 *   GET  /api/automod/users/:userId?guild_id=
 *   POST /api/automod/preview  : simule l'escalade automatique
 *   POST /api/automod/test     : teste une règle sur un message
 */

const { Controller, Get, Post } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { db } = require('../../../db/index.js');
const { Sanctions } = require('../services/sanctions.service.js');
const { AutomodEngine } = require('../services/automod-engine.service.js');

class AutomodController {
    static inject = [Sanctions, AutomodEngine];

    constructor(sanctions, engine) {
        this.sanctions = sanctions;
        this.engine = engine;
    }

    async listLogs(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const userId = req.query.user_id || null;
            const action = req.query.action || null;
            const page = Math.max(parseInt(req.query.page) || 1, 1);
            const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
            const offset = (page - 1) * limit;

            const where = ['guild_id = $1'];
            const params = [guildId];
            if (userId) { params.push(userId); where.push(`user_id = $${params.length}`); }
            if (action) { params.push(action); where.push(`action = $${params.length}`); }

            const whereStr = where.join(' AND ');
            const sql = `SELECT id, user_id, mod_id, action, channel_id, message_id, reason, metadata, source, created_at FROM mod_logs WHERE ${whereStr} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            const queryParams = [...params, limit, offset];
            const result = await db.pool.query({ text: sql, values: queryParams });
            const countSql = `SELECT COUNT(*)::int AS total FROM mod_logs WHERE ${whereStr}`;
            const countResult = await db.pool.query({ text: countSql, values: params });
            return {
                success: true,
                data: {
                    logs: result.rows || [],
                    page,
                    limit,
                    total: countResult.rows?.[0]?.total || 0,
                    pages: Math.ceil((countResult.rows?.[0]?.total || 0) / limit)
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getUser(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const userId = req.params.userId;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const warns = await db.pool.query(
                `SELECT id, reason, source, rule, created_at, expires_at, active FROM user_warnings WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 50`,
                [guildId, userId]
            );
            const sanctions = await db.pool.query(
                `SELECT id, type, reason, duration_ms, active, created_at, expires_at FROM user_sanctions WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 50`,
                [guildId, userId]
            );
            const activeCount = await this.sanctions.countActiveWarnings(guildId, userId);
            return {
                success: true,
                data: {
                    user_id: userId,
                    active_warnings: activeCount,
                    warnings: warns.rows || [],
                    sanctions: sanctions.rows || []
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async preview(req) {
        try {
            const guildId = req.body.guildId || process.env.GUILD_ID;
            const userId = req.body.userId;
            if (!guildId || !userId) return { success: false, error: 'guildId et userId requis' };
            const state = await featureRegistry.get(guildId, 'automod');
            const activeCount = await this.sanctions.countActiveWarnings(guildId, userId);
            const progression = state.config?.sanctions?.progression || [];
            const next = this.sanctions.pickProgression(activeCount, progression);
            return {
                success: true,
                data: {
                    active_warnings: activeCount,
                    next_sanction: next,
                    progression
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/automod')(AutomodController);
Get('/logs')(AutomodController.prototype, 'listLogs');
Get('/users/:userId')(AutomodController.prototype, 'getUser');
Post('/preview')(AutomodController.prototype, 'preview');

module.exports = { AutomodController };
