const assert = require('node:assert');
const { container } = require('../src/core/container.js');
const { RoadToInfiniteRepository } = require('../src/modules/game_road-to-infinite/road-to-infinite.repository.js');
const { RoadToInfiniteService } = require('../src/modules/game_road-to-infinite/road-to-infinite.service.js');
const { RoadToInfiniteController } = require('../src/modules/game_road-to-infinite/road-to-infinite.controller.js');

const { ready } = require('../src/db/index.js');

describe('Game: Road to Infinite Module Tests', () => {

    const channelId = '1533492692825276598';

    beforeAll(async () => {
        await ready;
    });

    test('Repository: should set and get counter state', async () => {
        const repo = container.resolve(RoadToInfiniteRepository);
        await repo.updateState(channelId, 42, 'test_user_1');

        const state = await repo.getState(channelId);
        assert.ok(state);
        assert.strictEqual(state.current_number, 42);
        assert.strictEqual(state.last_user_id, 'test_user_1');
    });

    test('Repository: should log scores and get leaderboard', async () => {
        const repo = container.resolve(RoadToInfiniteRepository);
        await repo.addScore(channelId, 'test_user_1', 'TestUser', 5);

        const scores = await repo.getScores(channelId, 5);
        assert.ok(Array.isArray(scores));
    });

    test('Service: should handle valid sequential counting', async () => {
        const service = container.resolve(RoadToInfiniteService);
        const repo = container.resolve(RoadToInfiniteRepository);
        service.getConfig = () => ({ enabled: true, channel_id: channelId });

        await repo.updateState(channelId, 10, 'user_a');

        let reacted = null;
        const mockMessage = {
            id: 'msg_valid_1',
            guild: { id: 'guild_1', name: 'Test Guild' },
            channel: { id: channelId, send: async () => {}, messages: { fetch: async () => new Map() } },
            author: { id: 'user_b', username: 'Bob', bot: false },
            content: '11',
            react: async (r) => { reacted = r; }
        };

        await service.handleIncomingMessage(mockMessage);
        assert.ok(reacted !== null);

        const state = await repo.getState(channelId);
        assert.strictEqual(state.current_number, 11);
        assert.strictEqual(state.last_user_id, 'user_b');
    });

    test('Service: should prevent double-post from same user', async () => {
        const service = container.resolve(RoadToInfiniteService);
        const repo = container.resolve(RoadToInfiniteRepository);
        service.getConfig = () => ({ enabled: true, channel_id: channelId });

        await repo.updateState(channelId, 11, 'user_b');

        let sentMsg = null;
        const mockMessage = {
            id: 'msg_double_1',
            guild: { id: 'guild_1', name: 'Test Guild' },
            channel: { id: channelId, send: async (payload) => { sentMsg = payload; }, messages: { fetch: async () => new Map() } },
            author: { id: 'user_b', username: 'Bob', bot: false },
            content: '12',
            react: async () => {}
        };

        await service.handleIncomingMessage(mockMessage);
        assert.ok(sentMsg, 'Should send double post warning message');

        const state = await repo.getState(channelId);
        assert.strictEqual(state.current_number, 11, 'Counter must stay unchanged on double post');
    });

    test('Service: should tolerate errors when max_errors > 1 and only reset on reaching limit', async () => {
        const service = container.resolve(RoadToInfiniteService);
        const repo = container.resolve(RoadToInfiniteRepository);
        service.getConfig = () => ({ enabled: true, channel_id: channelId, max_errors: 3 });

        await repo.updateState(channelId, 25, 'user_b', 0);

        let sentMessages = [];
        const mockMessage1 = {
            id: 'msg_wrong_1',
            guild: { id: 'guild_1', name: 'Test Guild' },
            channel: { id: channelId, send: async (payload) => { sentMessages.push(payload); }, messages: { fetch: async () => new Map() } },
            author: { id: 'user_c', username: 'Charlie', bot: false },
            content: '999',
            react: async () => {}
        };

        // 1ère erreur : Tolérée
        await service.handleIncomingMessage(mockMessage1);
        let state = await repo.getState(channelId);
        assert.strictEqual(state.current_number, 25, 'Counter must stay unchanged on first error when max_errors=3');
        assert.strictEqual(state.error_count, 1, 'Error count must be 1');

        // 2ème erreur : Tolérée
        await service.handleIncomingMessage(mockMessage1);
        state = await repo.getState(channelId);
        assert.strictEqual(state.current_number, 25, 'Counter must stay unchanged on second error');
        assert.strictEqual(state.error_count, 2, 'Error count must be 2');

        // 3ème erreur : Seuil atteint -> Reset
        await service.handleIncomingMessage(mockMessage1);
        state = await repo.getState(channelId);
        assert.strictEqual(state.current_number, 0, 'Counter must reset to 0 after 3rd error');
        assert.strictEqual(state.error_count, 0, 'Error count must reset to 0');
    });

    test('Controller: should return status and leaderboard', async () => {
        const controller = container.resolve(RoadToInfiniteController);
        const resState = await controller.getState({ query: { channel_id: channelId } });
        assert.ok(resState.success);

        const resScores = await controller.getLeaderboard({ query: { channel_id: channelId } });
        assert.ok(resScores.success);
    });

});
