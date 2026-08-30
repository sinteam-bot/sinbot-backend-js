/**
 * src/modules/security_autoban/controllers/autoban.controller.js
 *
 * Contrôleur REST pour le module Autoban.
 */

const { Controller, Get } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { AutobanService } = require('../services/autoban.service.js');
const logger = require('../../../utils/logger.js');

class AutobanController {
    static inject = [AutobanService];

    constructor(service) {
        this.service = service;
    }

    async getLogs(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const limit = parseInt(req.query?.limit, 10) || 50;
            const logs = await this.service.listLogs(guildId, limit);
            return { success: true, data: logs };
        } catch (err) {
            logger.error(`Erreur getLogs Autoban: ${err.message}`, 'AUTOBAN');
            return { success: false, error: err.message };
        }
    }

    async getConfig(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const state = await featureRegistry.get(guildId, 'autoban');
            return { success: true, data: state };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/autoban')(AutobanController);
Get('/logs')(AutobanController.prototype, 'getLogs');
Get('/config')(AutobanController.prototype, 'getConfig');

module.exports = { AutobanController };
