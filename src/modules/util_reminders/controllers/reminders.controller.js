/**
 * reminders.controller.js — endpoints REST pour RemindersController
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { ReminderService } = require('../services/reminder.service.js');

class RemindersController {
    static inject = [ReminderService];
    constructor(service) { this.service = service; }

    async listReminders(req) {
        try {
            const { guildId } = req.query || {};
            const list = await this.service.listByUser(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createReminder(req) {
        try {
            const { userId, text, fireAt, channelId } = req.body || {};
            const r = await this.service.createReminder({ userId, text, fireAt, channelId });
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async cancelReminder(req) {
        try {
            const r = await this.service.cancel(req.params.id, req.body?.userId);
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/reminders')(RemindersController.prototype, 'listReminders', 'createReminder', 'cancelReminder');

module.exports = { RemindersController };
