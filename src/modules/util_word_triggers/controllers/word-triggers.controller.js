/**
 * WordTriggersController.controller.js — endpoints REST pour WordTriggersController
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { WordTriggerService } = require('../services/word-trigger.service.js');

class WordTriggersController {
    @Get('/list')
    async listTriggers(req) {
        try {
            const { guildId } = req.query || {};
            const list = await this.service.list(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    @Post('/create')
    async createTrigger(req) {
        try {
            const data = req.body || {};
            const r = await this.service.create(data);
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    @Delete('/:id')
    async deleteTrigger(req) {
        try {
            await this.service.delete(req.params.id);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    static inject = [WordTriggerService];
    constructor(service) { this.service = service; }
}

Controller('/api/word-triggers')(WordTriggersController);

module.exports = { WordTriggersController };
