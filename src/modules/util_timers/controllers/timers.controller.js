/**
 * src/modules/util_timers/controllers/timers.controller.js
 *
 * Contrôleur REST pour les minuteries (Timers).
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { TimersService } = require('../services/timers.service.js');

class TimersController {
    static inject = [TimersService];

    constructor(service) {
        this.service = service;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.query?.user_id || 'default_user';
            const list = await this.service.listTimers(guildId, userId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const channelId = req.body?.channel_id;
            const userId = req.body?.user_id || 'api_user';
            const label = req.body?.label;
            const durationSeconds = req.body?.duration_seconds;

            return await this.service.createTimer({
                guildId,
                channelId,
                userId,
                label,
                durationSeconds
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteTimer(req) {
        try {
            return await this.service.cancelTimer(req.params?.id);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/timers')(TimersController);
Get('')(TimersController.prototype, 'list');
Post('')(TimersController.prototype, 'create');
Delete('/:id')(TimersController.prototype, 'deleteTimer');

module.exports = { TimersController };
