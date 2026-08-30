/**
 * src/modules/util_autofeeds/controllers/autofeeds.controller.js
 *
 * Contrôleur REST pour les flux automatiques (Autofeeds).
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { AutofeedsService } = require('../services/autofeeds.service.js');

class AutofeedsController {
    static inject = [AutofeedsService];

    constructor(service) {
        this.service = service;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.listFeeds(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { channel_id, feed_url, interval_minutes } = req.body || {};
            return await this.service.addFeed({
                guildId,
                channelId: channel_id,
                feedUrl: feed_url,
                intervalMinutes: interval_minutes
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteFeed(req) {
        try {
            return await this.service.deleteFeed(req.params?.id);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/autofeeds')(AutofeedsController);
Get('')(AutofeedsController.prototype, 'list');
Post('')(AutofeedsController.prototype, 'create');
Delete('/:id')(AutofeedsController.prototype, 'deleteFeed');

module.exports = { AutofeedsController };
