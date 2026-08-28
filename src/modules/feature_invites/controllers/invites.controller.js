/**
 * feature_invites/controllers/invites.controller.js
 *
 * Endpoints REST :
 *  - GET /api/invites/:guildId/:userId      → stats complètes
 *  - GET /api/invites/:guildId/leaderboard  → top inviters
 *  - GET /api/invites/:guildId/blacklist    → liste blacklist
 */

const { Controller, Get } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { InvitesService } = require('../services/invites.service.js');

class InvitesController {
    static inject = [InvitesService];

    constructor(service) {
        this.service = service;
    }

    @Get('/:guildId/:userId')
    async getUserStats(req, res) {
        const { guildId, userId } = req.params;
        const config = await this.service._getConfig(guildId);
        if (!config) return res.status(404).json({ error: 'Feature désactivée' });

        const info = await this.service.getUserInfo(guildId, userId);
        return res.json({ success: true, data: info });
    }

    @Get('/:guildId/leaderboard')
    async getLeaderboard(req, res) {
        const { guildId } = req.params;
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const config = await this.service._getConfig(guildId);
        if (!config) return res.status(404).json({ error: 'Feature désactivée' });

        const data = await this.service.getLeaderboard(guildId, limit);
        return res.json({ success: true, data });
    }

    @Get('/:guildId/blacklist')
    async getBlacklist(req, res) {
        const { guildId } = req.params;
        const config = await this.service._getConfig(guildId);
        if (!config) return res.status(404).json({ error: 'Feature désactivée' });

        const data = await this.service.getBlacklist(guildId);
        return res.json({ success: true, data });
    }
}

Controller('/api/invites')(InvitesController.prototype);

module.exports = { InvitesController };
