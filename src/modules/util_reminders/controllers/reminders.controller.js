/**
 * reminders.controller.js — endpoints REST pour RemindersController
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { ReminderService } = require('../services/reminders.service.js');

class RemindersController {
    @Get('/list')
    async listReminders(req) {
        try {
            const { guildId } = req.query || {};
            const list = await this.service.list(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    @Post('/create')
    async createReminder(req) {
        try {
            const { userId, text, fireAt, channelId } = req.body || {};
            const r = await this.service.create({ userId, text, fireAt, channelId });
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    @Post('/:id/cancel')
    async cancelReminder(req) {
        try {
            const r = await this.service.cancel(req.params.id);
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    static inject = [ReminderService];
    constructor(service) { this.service = service; }
}

Controller('/api/reminders')(RemindersController);

module.exports = { RemindersController };
