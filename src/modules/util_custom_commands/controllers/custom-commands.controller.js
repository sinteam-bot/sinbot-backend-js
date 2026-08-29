/**
 * CustomCommandsController — endpoints REST pour CustomCommandsController
 */

const { Controller } = require('../../../core/index.js');
const { CustomCommandService } = require('../services/custom-command.service.js');

class CustomCommandsController {
    static inject = [CustomCommandService];
    constructor(service) { this.service = service; }

    async listCommands(req) {
        try {
            const { guildId } = req.query || {};
            const list = await this.service.list(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createCommand(req) {
        try {
            const r = await this.service.create(req.body || {});
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteCommand(req) {
        try {
            const r = await this.service.delete(req.params.id);
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/custom-commands')(CustomCommandsController.prototype, 'listCommands', 'createCommand', 'deleteCommand');

module.exports = { CustomCommandsController };
