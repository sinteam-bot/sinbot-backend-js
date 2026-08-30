/**
 * src/modules/community_confessions/controllers/confessions.controller.js
 *
 * Contrôleur REST pour la gestion et modération des confessions anonymes.
 */

const { Controller, Get, Post, Delete, container, getConfig } = require('../../../core/index.js');
const { ConfessionsService } = require('../services/confessions.service.js');

class ConfessionsController {
    static inject = [ConfessionsService];

    constructor(service) {
        this.service = service;
    }

    _getClient() {
        return container.has('Client') ? container.resolve('Client') : null;
    }

    _getConfig() {
        return getConfig().features?.confessions || {};
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const status = req.query?.status || null;
            const limit = parseInt(req.query?.limit, 10) || 50;
            const list = await this.service.listConfessions(guildId, status, limit);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const authorId = req.body?.author_id || 'api_user';
            const content = req.body?.content;
            const imageUrl = req.body?.image_url;
            const parentNumber = req.body?.parent_number;
            const cfg = this._getConfig();
            const client = this._getClient();

            return await this.service.submitConfession({
                guildId,
                authorId,
                content,
                imageUrl,
                parentNumber,
                config: cfg,
                client
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async approve(req) {
        try {
            const id = req.params?.id;
            const reviewer = req.body?.reviewer || 'dashboard_admin';
            const cfg = this._getConfig();
            const client = this._getClient();
            return await this.service.approveConfession(id, reviewer, cfg, client);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async reject(req) {
        try {
            const id = req.params?.id;
            const reviewer = req.body?.reviewer || 'dashboard_admin';
            const cfg = this._getConfig();
            const client = this._getClient();
            return await this.service.rejectConfession(id, reviewer, cfg, client);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async listBans(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const bans = await this.service.listBans(guildId);
            return { success: true, data: bans };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async ban(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.body?.user_id;
            const reason = req.body?.reason;
            const bannedBy = req.body?.banned_by || 'admin';
            const res = await this.service.banUser(guildId, userId, reason, bannedBy);
            return { success: true, data: res };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async unban(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.params?.userId || req.body?.user_id;
            await this.service.unbanUser(guildId, userId);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/confessions')(ConfessionsController);
Get('')(ConfessionsController.prototype, 'list');
Post('')(ConfessionsController.prototype, 'create');
Post('/:id/approve')(ConfessionsController.prototype, 'approve');
Post('/:id/reject')(ConfessionsController.prototype, 'reject');
Get('/bans')(ConfessionsController.prototype, 'listBans');
Post('/bans')(ConfessionsController.prototype, 'ban');
Delete('/bans/:userId')(ConfessionsController.prototype, 'unban');

module.exports = { ConfessionsController };
