/**
 * src/modules/automation_scheduler/controllers/scheduler.controller.js
 *
 * Contrôleur REST pour les messages programmés.
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
            const { name, channelId, content, embed, intervalMinutes, cron } = req.body || {};

            const res = await this.service.createScheduledMessage({
                guildId,
                name,
                channelId,
                content,
                embed,
                intervalMinutes: intervalMinutes ? parseInt(intervalMinutes, 10) : undefined,
                cron,
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
}

Controller('/api/scheduler')(SchedulerController);
Get('')(SchedulerController.prototype, 'list');
Post('')(SchedulerController.prototype, 'create');
Delete('/:id')(SchedulerController.prototype, 'deleteMessage');
Patch('/:id/toggle')(SchedulerController.prototype, 'toggleMessage');

module.exports = { SchedulerController };
