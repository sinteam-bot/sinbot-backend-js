/**
 * src/modules/community_starboard/controllers/starboard.controller.js
 *
 * Contrôleur REST pour le module Starboard.
 */

const { Controller, Get, Post } = require('../../../core/index.js');
const { StarboardService } = require('../services/starboard.service.js');
const { StarboardRepository } = require('../services/starboard.repository.js');
const { configService } = require('../../../config/index.js');
const logger = require('../../../utils/logger.js');

class StarboardController {
    static inject = [StarboardService, StarboardRepository];

    constructor(service, repo) {
        this.service = service;
        this.repo = repo;
    }

    async getStatus(req) {
        const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
        const conf = this.service.getConfig(guildId);
        const total = await this.repo.countEntries(guildId);
        return {
            success: true,
            data: {
                config: conf,
                stats: { totalStarred: total }
            }
        };
    }

    async saveConfig(req) {
        try {
            const body = req.body || {};
            if (configService && typeof configService.saveModuleConfig === 'function') {
                await configService.saveModuleConfig('starboard', body);
            }
            return {
                success: true,
                message: 'Configuration du Starboard mise à jour avec succès',
                data: body
            };
        } catch (error) {
            logger.error(`Erreur saveConfig Starboard: ${error.message}`, 'STARBOARD');
            return { success: false, error: error.message };
        }
    }

    async getEntries(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const limit = Math.min(Math.max(parseInt(req.query?.limit) || 50, 1), 100);
            const page = Math.max(parseInt(req.query?.page) || 1, 1);
            const offset = (page - 1) * limit;

            const entries = await this.repo.listEntries(guildId, { limit, offset });
            const total = await this.repo.countEntries(guildId);

            return {
                success: true,
                data: entries,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error(`Erreur getEntries Starboard: ${error.message}`, 'STARBOARD');
            return { success: false, error: error.message };
        }
    }
}

Controller('/api/starboard')(StarboardController);
Get('')(StarboardController.prototype, 'getStatus');
Get('/status')(StarboardController.prototype, 'getStatus');
Post('/config')(StarboardController.prototype, 'saveConfig');
Get('/entries')(StarboardController.prototype, 'getEntries');

module.exports = { StarboardController };
