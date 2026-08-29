/**
 * CustomCommandsController.controller.js — endpoints REST pour CustomCommandsController
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { CustomCommandService } = require('../services/custom-command.service.js');

class CustomCommandsController {
    @Get('/list')
    async listCustomCommands(req) {
        try {
            const { guildId } = req.query || {};
            const list = await this.service.list(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    @Post('/create')
    async createCustomCommand(req) {
        try {
            const data = req.body || {};
            const r = await this.service.create(data);
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    @Delete('/:id')
    async deleteCustomCommand(req) {
        try {
            await this.service.delete(req.params.id);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    static inject = [CustomCommandService];
    constructor(service) { this.service = service; }
}

Controller('/api/custom-commands')(CustomCommandsController);

module.exports = { CustomCommandsController };
