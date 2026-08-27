const { Controller, Get, Post } = require('../../core/index.js');
const { RoadToInfiniteService } = require('./road-to-infinite.service.js');

class RoadToInfiniteController {
    static inject = [RoadToInfiniteService];

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
                    error_count: state.errorCount ?? 0,
                    max_errors: state.maxErrors ?? 1,
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

Controller('/api/games/counter')(RoadToInfiniteController);
Get('')(RoadToInfiniteController.prototype, 'getGameOverview');
Get('/state')(RoadToInfiniteController.prototype, 'getState');
Get('/leaderboard')(RoadToInfiniteController.prototype, 'getLeaderboard');
Post('/reset')(RoadToInfiniteController.prototype, 'resetGame');

module.exports = {
    RoadToInfiniteController
};
