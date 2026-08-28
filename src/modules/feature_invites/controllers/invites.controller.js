/**
 * feature_invites/controllers/invites.controller.js
 *
 * Endpoints REST :
 *  - GET /api/invites/:guildId/:userId      → stats complètes
 *  - GET /api/invites/:guildId/leaderboard  → top inviters
 *  - GET /api/invites/:guildId/blacklist    → liste blacklist
 */

const { Controller, Get } = require('../../../core/index.js');
const { InvitesService } = require('../services/invites.service.js');

class InvitesController {
    static inject = [InvitesService];

    constructor(service) {
        this.service = service;
    }

    async getUserStats(req, res) {
        const { guildId, userId } = req.params;
        const config = await this.service._getConfig(guildId);
        if (!config) return res.status(404).json({ error: 'Feature désactivée' });

        const info = await this.service.getUserInfo(guildId, userId);
        return res.json({ success: true, data: info });
    }

    async getLeaderboard(req, res) {
        const { guildId } = req.params;
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const config = await this.service._getConfig(guildId);
        if (!config) return res.status(404).json({ error: 'Feature désactivée' });

        const data = await this.service.getLeaderboard(guildId, limit);
        return res.json({ success: true, data });
    }

    async getBlacklist(req, res) {
        const { guildId } = req.params;
        const config = await this.service._getConfig(guildId);
        if (!config) return res.status(404).json({ error: 'Feature désactivée' });

        const data = await this.service.getBlacklist(guildId);
        return res.json({ success: true, data });
    }
}

Controller('/api/invites')(InvitesController);
Get('/:guildId/:userId')(InvitesController.prototype, 'getUserStats');
Get('/:guildId/leaderboard')(InvitesController.prototype, 'getLeaderboard');
Get('/:guildId/blacklist')(InvitesController.prototype, 'getBlacklist');

module.exports = { InvitesController };
