/**
 * EngagementController — endpoints REST pour la feature
 * engagement avancé (reminders + triggers + custom cmds)
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { ReminderService } = require('../services/reminder.service.js');
const { WordTriggerService } = require('../services/word-trigger.service.js');
const { CustomCommandService } = require('../services/custom-command.service.js');

class EngagementController {
    static inject = [ReminderService, WordTriggerService, CustomCommandService];

    constructor(reminder, trigger, customs) {
        this.reminder = reminder;
        this.trigger = trigger;
        this.customs = customs;
    }

    // ============== REMINDERS ==============

    async listReminders(req) {
        try {
            const userId = req.query.user_id;
            if (!userId) return { success: false, error: 'user_id requis' };
            const data = await this.reminder.listByUser(userId);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createReminder(req) {
        try {
            const r = await this.reminder.createReminder({
                userId: req.body.userId,
                guildId: req.body.guildId,
                channelId: req.body.channelId,
                text: req.body.text,
                fireAt: req.body.fireAt
            });
            return { success: r.ok, data: r.data, error: r.error || null };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async cancelReminder(req) {
        try {
            const r = await this.reminder.cancel(req.params.id, req.body?.userId);
            return { success: r.ok, error: r.error || null };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ============== TRIGGERS ==============

    async listTriggers(req) {
        try {
            const guildId = req.query.guild_id;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const data = await this.trigger.list(guildId);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createTrigger(req) {
        try {
            const r = await this.trigger.create({
                guildId: req.body.guildId,
                triggerText: req.body.triggerText,
                matchType: req.body.matchType || 'exact',
                responseText: req.body.responseText,
                responseEmbed: req.body.responseEmbed,
                excludeChannels: req.body.excludeChannels,
                excludeRoles: req.body.excludeRoles,
                cooldown: req.body.cooldown,
                createdBy: req.body.createdBy
            });
            return { success: r.ok, data: r.data, error: r.error || null };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteTrigger(req) {
        try {
            await this.trigger.delete(req.params.id);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ============== CUSTOM COMMANDS ==============

    async listCustomCommands(req) {
        try {
            const guildId = req.query.guild_id;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const data = await this.customs.list(guildId);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createCustomCommand(req) {
        try {
            const r = await this.customs.create({
                guildId: req.body.guildId,
                name: req.body.name,
                responseText: req.body.responseText,
                responseEmbed: req.body.responseEmbed,
                restrictChannels: req.body.restrictChannels,
                restrictRoles: req.body.restrictRoles,
                cooldown: req.body.cooldown,
                createdBy: req.body.createdBy
            });
            return { success: r.ok, data: r.data, error: r.error || null };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteCustomCommand(req) {
        try {
            await this.customs.delete(req.params.id);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/engagement-advanced')(EngagementController);
Get('/reminders')(EngagementController.prototype, 'listReminders');
Post('/reminders')(EngagementController.prototype, 'createReminder');
Delete('/reminders/:id')(EngagementController.prototype, 'cancelReminder');
Get('/triggers')(EngagementController.prototype, 'listTriggers');
Post('/triggers')(EngagementController.prototype, 'createTrigger');
Delete('/triggers/:id')(EngagementController.prototype, 'deleteTrigger');
Get('/commands')(EngagementController.prototype, 'listCustomCommands');
Post('/commands')(EngagementController.prototype, 'createCustomCommand');
Delete('/commands/:id')(EngagementController.prototype, 'deleteCustomCommand');

module.exports = { EngagementController };
