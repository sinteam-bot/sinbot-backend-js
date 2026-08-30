/**
 * src/modules/automation_autothread/controllers/autothread.controller.js
 *
 * Contrôleur REST pour la gestion des salons auto-thread.
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { AutoThreadService } = require('../services/autothread.service.js');

class AutoThreadController {
    static inject = [AutoThreadService];

    constructor(service) {
        this.service = service;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.listChannels(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async setChannel(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { channel_id, title_format, intro_message, slowmode_seconds, auto_pin, enabled } = req.body || {};

            const result = await this.service.setChannel({
                guildId,
                channelId: channel_id,
                titleFormat: title_format,
                introMessage: intro_message,
                slowmodeSeconds: slowmode_seconds,
                autoPin: auto_pin,
                enabled: enabled !== undefined ? enabled : true
            });

            return { success: true, data: result };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async removeChannel(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const channelId = req.params?.channelId || req.body?.channel_id || req.query?.channel_id;

            await this.service.removeChannel(guildId, channelId);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/autothread')(AutoThreadController);
Get('')(AutoThreadController.prototype, 'list');
Post('')(AutoThreadController.prototype, 'setChannel');
Delete('/:channelId')(AutoThreadController.prototype, 'removeChannel');

module.exports = { AutoThreadController };
