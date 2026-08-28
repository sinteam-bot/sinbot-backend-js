const assert = require('node:assert');
const { container } = require('../src/core/container.js');
const { XPLevelRepository } = require('../src/modules/feature_xp-level/xp-level.repository.js');
const { XPLevelService } = require('../src/modules/feature_xp-level/xp-level.service.js');
const { XPLevelController } = require('../src/modules/feature_xp-level/xp-level.controller.js');

describe('Feature: XP & Level Module Tests', () => {

    const userId = 'test_user_xp_level';
    const username = 'LevelMaster';

    test('Repository: should get or create user XP record and log transactions', async () => {
        const repo = container.resolve(XPLevelRepository);
        const user = await repo.getOrCreateUserXP(userId, username);

        assert.ok(user);
        assert.strictEqual(user.user_id, userId);

        await repo.updateUserXP(userId, username, 400, 2, true);
        await repo.logTransaction(userId, username, 400, 'test', 'Gain initial de test');

        const updated = await repo.getUserXP(userId);
        assert.strictEqual(updated.total_xp, 400);
        assert.strictEqual(updated.level, 2);
    });

    test('Service: should calculate levels and progression accurately', () => {
        const service = container.resolve(XPLevelService);

        assert.strictEqual(service.calculateLevel(0), 0);
        assert.strictEqual(service.calculateLevel(99), 0);
        assert.strictEqual(service.calculateLevel(100), 1);
        assert.strictEqual(service.calculateLevel(399), 1);
        assert.strictEqual(service.calculateLevel(400), 2);
        assert.strictEqual(service.calculateLevel(900), 3);
        assert.strictEqual(service.calculateLevel(1600), 4);

        const progress = service.getXPProgress(250);
        assert.strictEqual(progress.currentLevel, 1);
        assert.strictEqual(progress.xpInCurrentLevel, 150);
        assert.strictEqual(progress.xpNeededForNext, 300);
        assert.strictEqual(progress.progressPercent, 50);
    });

    test('Service: should manage voice session tracking', async () => {
        const repo = container.resolve(XPLevelRepository);
        const service = container.resolve(XPLevelService);

        await repo.startVoiceSession(userId, username, 'voice_chan_1', 'Vocal Général');
        const ended = await repo.endVoiceSession(userId);

        assert.ok(ended);
        assert.ok(ended.durationMinutes >= 1);
    });

    test('Controller: should return leaderboard, user profile and reward roles', async () => {
        const controller = container.resolve(XPLevelController);

        const resLb = await controller.getLeaderboard({ query: { limit: '10' } });
        assert.ok(resLb.success);
        assert.ok(resLb.data);
        assert.ok(Array.isArray(resLb.data.entries));

        const resProfile = await controller.getUserProfile({ params: { userId } });
        assert.ok(resProfile.success);
        assert.strictEqual(resProfile.data.userId, userId);
        assert.ok(resProfile.data.progress);

        const resRewards = await controller.getRewardRoles({ query: {} });
        assert.ok(resRewards.success);
        assert.ok(Array.isArray(resRewards.data));
    });

    test('Service & Repository: should fetch reward roles and assign them safely', async () => {
        const repo = container.resolve(XPLevelRepository);
        const service = container.resolve(XPLevelService);
        const levelUp = container.resolve(require('../src/modules/feature_xp-level/level-up.service.js').LevelUpService);

        const roles = await repo.getRewardRoles('guild_123');
        assert.ok(Array.isArray(roles));

        let roleAdded = false;
        const mockMember = {
            id: userId,
            user: { tag: 'LevelMaster#0001' },
            roles: {
                cache: new Map(),
                add: async (roleId) => { roleAdded = true; }
            }
        };

        const mockGuild = {
            id: 'guild_123',
            roles: {
                cache: new Map([
                    ['5', { id: '5', name: 'Membre Actif' }],
                    ['role_veteran', { id: 'role_veteran', name: 'Vétéran' }]
                ])
            }
        };

        const results = await levelUp.applyRewardRoles(mockGuild, mockMember, 10, { 5: '5', 20: 'role_veteran' }, { cumulable: true });
        assert.ok(Array.isArray(results.added) || Array.isArray(results.removed));
    });

});
