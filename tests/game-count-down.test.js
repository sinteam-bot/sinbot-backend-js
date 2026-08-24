const { test, describe } = require('node:test');
const assert = require('node:assert');
const { container } = require('../src/core/container.js');
const { CountDownRepository } = require('../src/modules/game_count-down/count-down.repository.js');
const { CountDownService } = require('../src/modules/game_count-down/count-down.service.js');
const { CountDownController } = require('../src/modules/game_count-down/count-down.controller.js');

describe('Game: Count Down Module Tests', () => {

    const channelId = '1540356133913366538';

    test('Repository: should set, get and reset countdown state', async () => {
        const repo = container.resolve(CountDownRepository);
        await repo.updateState(channelId, 850, 1, 845, 'user_cd_1');

        const state = await repo.getState(channelId);
        assert.ok(state);
        assert.strictEqual(state.current_number, 850);
        assert.strictEqual(state.last_user_id, 'user_cd_1');
        assert.strictEqual(state.is_trap_active, 1);
        assert.strictEqual(state.trap_number, 845);

        await repo.updateState(channelId, 900, 0, null, null);
        const resetState = await repo.getState(channelId);
        assert.strictEqual(resetState.current_number, 900);
    });

    test('Service: should handle valid sequential countdown', async () => {
        const service = container.resolve(CountDownService);
        const repo = container.resolve(CountDownRepository);
        service.getConfig = () => ({ enabled: true, channel_id: channelId });

        await repo.updateState(channelId, 899, 0, null, 'user_alice');

        let reacted = null;
        const mockMessage = {
            id: 'msg_cd_1',
            guild: { id: 'guild_1', name: 'Test Guild' },
            channel: { id: channelId, send: async () => {} },
            author: { id: 'user_bob', username: 'Bob', bot: false },
            content: '898',
            react: async (r) => { reacted = r; }
        };

        await service.handleIncomingMessage(mockMessage);
        assert.ok(reacted !== null);

        const state = await repo.getState(channelId);
        assert.strictEqual(state.last_user_id, 'user_bob');
    });

    test('Controller: should return status and leaderboard', async () => {
        const controller = container.resolve(CountDownController);
        const resState = await controller.getState({ query: { channel_id: channelId } });
        assert.ok(resState.success);

        const resScores = await controller.getLeaderboard({ query: { channel_id: channelId } });
        assert.ok(resScores.success);
    });

});
