/**
 * WordTriggersController.controller.js — endpoints REST pour WordTriggersController
 */

const { Controller } = require('../../../core/index.js');
const { WordTriggerService } = require('../services/word-trigger.service.js');

class WordTriggersController {
    static inject = [WordTriggerService];
    constructor(service) { this.service = service; }

    async listTriggers(req) {
        try {
            const { guildId } = req.query || {};
            const list = await this.service.list(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createTrigger(req) {
        try {
            const r = await this.service.create(req.body || {});
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteTrigger(req) {
        try {
            const r = await this.service.delete(req.params.id);
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/word-triggers')(WordTriggersController.prototype, 'listTriggers', 'createTrigger', 'deleteTrigger');

module.exports = { WordTriggersController };
