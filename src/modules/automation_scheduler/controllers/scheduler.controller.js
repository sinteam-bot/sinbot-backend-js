/**
 * src/modules/automation_scheduler/controllers/scheduler.controller.js
 *
 * Contrôleur REST pour les messages programmés et templates rotatifs (P6).
 */

const { Controller, Get, Post, Delete, Patch } = require('../../../core/index.js');
const { SchedulerService } = require('../services/scheduler.service.js');
const { SchedulerRepository } = require('../services/scheduler.repository.js');
const logger = require('../../../utils/logger.js');

class SchedulerController {
    static inject = [SchedulerService, SchedulerRepository];

    constructor(service, repo) {
        this.service = service;
        this.repo = repo;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.list(guildId);
            return {
                success: true,
                data: list
            };
        } catch (error) {
            logger.error(`Erreur list Scheduler: ${error.message}`, 'SCHEDULER');
            return { success: false, error: error.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const {
                name, channelId, content, embed, intervalMinutes, cron,
                timezone, auto_clean, template_id, is_one_time, run_at_timestamp
            } = req.body || {};

            const res = await this.service.createScheduledMessage({
                guildId,
                name,
                channelId,
                content,
                embed,
                intervalMinutes: intervalMinutes ? parseInt(intervalMinutes, 10) : undefined,
                cron,
                timezone,
                autoClean: Boolean(auto_clean),
                templateId: template_id,
                isOneTime: Boolean(is_one_time),
                runAtTimestamp: run_at_timestamp ? parseInt(run_at_timestamp, 10) : null,
                createdBy: req.user?.id || 'admin'
            });

            return res;
        } catch (error) {
            logger.error(`Erreur create Scheduler: ${error.message}`, 'SCHEDULER');
            return { success: false, error: error.message };
        }
    }

    async deleteMessage(req) {
        try {
            const id = req.params?.id;
            await this.service.delete(id);
            return { success: true, message: 'Message programmé supprimé' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async toggleMessage(req) {
        try {
            const id = req.params?.id;
            return await this.service.toggle(id);
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // =================== TEMPLATES ===================

    async listTemplates(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.listTemplates(guildId);
            return { success: true, data: list };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async createTemplate(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { name, items } = req.body || {};
            const res = await this.service.createTemplate({ guildId, name, items });
            return { success: true, data: res };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deleteTemplate(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const name = req.params?.name;
            await this.service.deleteTemplate(guildId, name);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

Controller('/api/scheduler')(SchedulerController);
Get('/templates')(SchedulerController.prototype, 'listTemplates');
Post('/templates')(SchedulerController.prototype, 'createTemplate');
Delete('/templates/:name')(SchedulerController.prototype, 'deleteTemplate');
Get('')(SchedulerController.prototype, 'list');
Post('')(SchedulerController.prototype, 'create');
Delete('/:id')(SchedulerController.prototype, 'deleteMessage');
Patch('/:id/toggle')(SchedulerController.prototype, 'toggleMessage');

module.exports = { SchedulerController };
