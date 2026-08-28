/**
 * ReportsController — endpoints REST
 *
 *   GET    /api/reports?guild_id=&status=&reporter_id=&reported_id=&page=1
 *   GET    /api/reports/:id
 *   POST   /api/reports
 *   POST   /api/reports/:id/resolve
 *   POST   /api/reports/:id/dismiss
 *   GET    /api/reports/:id/actions
 *   GET    /api/reports/stats?guild_id=
 */

const { Controller, Get, Post } = require('../../../core/index.js');
const { ReportsService } = require('../services/reports.service.js');

class ReportsController {
    static inject = [ReportsService];

    constructor(service) {
        this.service = service;
    }

    async list(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const limit = Math.min(parseInt(req.query.limit) || 50, 200);
            const offset = Math.max(parseInt(req.query.offset) || 0, 0);
            const data = await this.service.list(guildId, {
                status: req.query.status || null,
                reporterId: req.query.reporter_id || null,
                reportedId: req.query.reported_id || null,
                limit, offset
            });
            return { success: true, data, total: data.length };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async get(req) {
        try {
            const r = await this.service.get(req.params.id);
            if (!r) return { success: false, error: 'introuvable' };
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const { getConfig } = require('../../../config/index.js');
            const cfg = getConfig().features?.reports || {};
            const r = await this.service.create({
                guildId: req.body.guildId || process.env.GUILD_ID,
                reporterId: req.body.reporterId,
                reportedId: req.body.reportedId,
                channelId: req.body.channelId || null,
                messageId: req.body.messageId || null,
                reason: req.body.reason,
                category: req.body.category || 'other',
                config: cfg
            });
            if (!r.ok) return { success: false, error: r.error, data: r.data || null };
            return { success: true, data: r.data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async resolve(req) {
        try {
            const r = await this.service.resolve(
                req.params.id, req.body.staffId, req.body.action || 'custom', req.body.notes
            );
            if (!r.ok) return { success: false, error: r.error };
            return { success: true, data: r.data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async dismiss(req) {
        try {
            const r = await this.service.dismiss(
                req.params.id, req.body.staffId, req.body.notes
            );
            if (!r.ok) return { success: false, error: r.error };
            return { success: true, data: r.data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async listActions(req) {
        try {
            const data = await this.service.listActions(req.params.id);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async stats(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const data = await this.service.stats(guildId);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/reports')(ReportsController);
Get('/')(ReportsController.prototype, 'list');
Get('/stats')(ReportsController.prototype, 'stats');
Get('/:id')(ReportsController.prototype, 'get');
Get('/:id/actions')(ReportsController.prototype, 'listActions');
Post('/')(ReportsController.prototype, 'create');
Post('/:id/resolve')(ReportsController.prototype, 'resolve');
Post('/:id/dismiss')(ReportsController.prototype, 'dismiss');

module.exports = { ReportsController };
