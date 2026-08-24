const { Controller, Get, Post } = require('../../core/index.js');
const { CountDownService } = require('./count-down.service.js');

class CountDownController {
    static inject = [CountDownService];

    constructor(service) {
        this.service = service;
    }

    async getGameOverview(req) {
        const channelId = req.query.channel_id || null;
        const state = await this.service.getGameState(channelId);
        const scores = await this.service.getLeaderboard(channelId, 50);
        const config = this.service.getConfig();

        return {
            success: true,
            data: {
                state: {
                    current_number: state.currentNumber,
                    is_trap_active: state.isTrapActive ? 1 : 0,
                    trap_number: state.trapNumber,
                    last_user_id: state.lastUserId,
                    updated_at: state.updatedAt
                },
                scores,
                config
            }
        };
    }

    async getState(req) {
        const channelId = req.query.channel_id || null;
        const data = await this.service.getGameState(channelId);
        return { success: true, data };
    }

    async getLeaderboard(req) {
        const channelId = req.query.channel_id || null;
        const limit = parseInt(req.query.limit, 10) || 10;
        const data = await this.service.getLeaderboard(channelId, limit);
        return { success: true, data };
    }

    async resetGame(req) {
        const channelId = req.body?.channel_id || null;
        const data = await this.service.resetGame(channelId);
        return { success: true, ...data };
    }
}

Controller('/api/games/countdown')(CountDownController);
Get('')(CountDownController.prototype, 'getGameOverview');
Get('/state')(CountDownController.prototype, 'getState');
Get('/leaderboard')(CountDownController.prototype, 'getLeaderboard');
Post('/reset')(CountDownController.prototype, 'resetGame');

module.exports = {
    CountDownController
};
