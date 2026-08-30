/**
 * src/modules/community_ranks/controllers/ranks.controller.js
 *
 * Contrôleur REST pour les rangs depuis le dashboard.
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { RanksService } = require('../services/ranks.service.js');
const logger = require('../../../utils/logger.js');

class RanksController {
    static inject = [RanksService];

    constructor(service) {
        this.service = service;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.listRanks(guildId);
            return { success: true, data: list };
        } catch (err) {
            logger.error(`Erreur list Ranks: ${err.message}`, 'RANKS');
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { roleId, name, description } = req.body || {};
            return await this.service.createRank({
                guildId,
                roleId,
                name,
                description
            });
        } catch (err) {
            logger.error(`Erreur create Rank: ${err.message}`, 'RANKS');
            return { success: false, error: err.message };
        }
    }

    async deleteRank(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const name = req.params?.name;
            return await this.service.deleteRank(guildId, name);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/ranks')(RanksController);
Get('')(RanksController.prototype, 'list');
Post('')(RanksController.prototype, 'create');
Delete('/:name')(RanksController.prototype, 'deleteRank');

module.exports = { RanksController };
