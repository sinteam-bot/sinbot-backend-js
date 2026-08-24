const { Controller, Get, Post } = require('../../core/index.js');
const { XPLevelService } = require('./xp-level.service.js');

class XPLevelController {
    static inject = [XPLevelService];

    constructor(service) {
        this.service = service;
    }

    async getLeaderboard(req) {
        const limit = parseInt(req.query.limit, 10) || 50;
        const leaderboard = await this.service.getLeaderboard(limit);
        return { success: true, data: leaderboard };
    }

    async getUserProfile(req) {
        const userId = req.params?.userId || req.query?.user_id;
        if (!userId) {
            return { success: false, error: 'userId requis' };
        }
        const profile = await this.service.getUserProfile(userId);
        return { success: true, data: profile };
    }

    async getRewardRoles(req) {
        const guildId = req.query?.guild_id || null;
        const roles = await this.service.repo.getRewardRoles(guildId);
        return { success: true, data: roles };
    }

    async grantXP(req) {
        const { userId, username, amount, reason } = req.body || {};
        if (!userId || !amount) {
            return { success: false, error: 'userId et amount requis' };
        }
        const result = await this.service.addXP(userId, username || `User-${userId}`, parseInt(amount, 10), 'admin_grant', reason || 'Ajout manuel administrateur');
        return { success: true, data: result };
    }
}

Controller('/api/xp')(XPLevelController);
Get('/leaderboard')(XPLevelController.prototype, 'getLeaderboard');
Get('/user/:userId')(XPLevelController.prototype, 'getUserProfile');
Get('/rewards')(XPLevelController.prototype, 'getRewardRoles');
Post('/grant')(XPLevelController.prototype, 'grantXP');

module.exports = {
    XPLevelController
};
