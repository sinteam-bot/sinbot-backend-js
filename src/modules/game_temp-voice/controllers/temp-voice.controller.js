/**
 * TempVoiceController — endpoints REST
 *
 *   GET   /api/temp-voice/config?guild_id=
 *   PATCH /api/temp-voice/config
 *   GET   /api/temp-voice/active?guild_id=
 *   GET   /api/temp-voice/count?guild_id=
 */

const { Controller, Get, Patch } = require('../../../core/index.js');
const { TempVoiceService } = require('../services/temp-voice.service.js');

class TempVoiceController {
    static inject = [TempVoiceService];

    constructor(service) {
        this.service = service;
    }

    async getConfig(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            return { success: true, data: await this.service.getConfig(guildId) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async updateConfig(req) {
        try {
            const guildId = req.body.guildId || process.env.GUILD_ID;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const data = await this.service.setConfig(guildId, req.body || {});
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async listActive(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            return { success: true, data: await this.service.listActive(guildId) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async count(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            return { success: true, data: { count: await this.service.listActive(guildId).then(l => l.length) } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/temp-voice')(TempVoiceController);
Get('/config')(TempVoiceController.prototype, 'getConfig');
Patch('/config')(TempVoiceController.prototype, 'updateConfig');
Get('/active')(TempVoiceController.prototype, 'listActive');
Get('/count')(TempVoiceController.prototype, 'count');

module.exports = { TempVoiceController };
