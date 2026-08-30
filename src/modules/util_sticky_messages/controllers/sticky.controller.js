/**
 * src/modules/util_sticky_messages/controllers/sticky.controller.js
 *
 * Contrôleur REST pour les sticky messages.
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { StickyService } = require('../services/sticky.service.js');

class StickyController {
    static inject = [StickyService];

    constructor(service) {
        this.service = service;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.listSticky(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { channel_id, content, embed_json, cooldown_messages } = req.body || {};
            return await this.service.setSticky({
                guildId,
                channelId: channel_id,
                content,
                embedJson: embed_json,
                cooldownMessages: cooldown_messages
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async remove(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const channelId = req.body?.channel_id || req.query?.channel_id;
            return await this.service.removeSticky(guildId, channelId);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/sticky-messages')(StickyController);
Get('')(StickyController.prototype, 'list');
Post('')(StickyController.prototype, 'create');
Delete('')(StickyController.prototype, 'remove');

module.exports = { StickyController };
