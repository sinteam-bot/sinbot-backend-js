/**
 * src/modules/util_highlights/controllers/highlights.controller.js
 *
 * Contrôleur REST pour les alertes mots-clés (Highlights).
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { HighlightsService } = require('../services/highlights.service.js');

class HighlightsController {
    static inject = [HighlightsService];

    constructor(service) {
        this.service = service;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.query?.user_id || 'default_user';
            const list = await this.service.listKeywords(guildId, userId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.body?.user_id || 'default_user';
            const keyword = req.body?.keyword;
            return await this.service.addKeyword(guildId, userId, keyword);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async remove(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.body?.user_id || req.query?.user_id || 'default_user';
            const keyword = req.body?.keyword || req.query?.keyword;
            return await this.service.removeKeyword(guildId, userId, keyword);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/highlights')(HighlightsController);
Get('')(HighlightsController.prototype, 'list');
Post('')(HighlightsController.prototype, 'create');
Delete('')(HighlightsController.prototype, 'remove');

module.exports = { HighlightsController };
