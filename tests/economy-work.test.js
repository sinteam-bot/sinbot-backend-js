import { describe, it, expect, beforeEach } from 'vitest';
import { container } from '../src/core/container.js';
import { EconomyService } from '../src/modules/engagement_economy/services/economy.service.js';
import { EconomyRepository } from '../src/modules/engagement_economy/services/economy.repository.js';
import { db } from '../src/db/index.js';

describe('Feature G09: Economy /work Command Tests', () => {
    let service;
    let repo;
    const guildId = 'test_guild_work_123';
    const userId = 'test_user_work_456';

    beforeEach(async () => {
        repo = container.resolve(EconomyRepository);
        service = container.resolve(EconomyService);
        // Clean test user data
        await db.pool.query(`DELETE FROM user_economy WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM economy_transactions WHERE guild_id = $1`, [guildId]);
    });

    it('should grant coins on work and apply cooldown', async () => {
        const config = {
            work_cooldown_hours: 1,
            work_min_reward: 100,
            work_max_reward: 300
        };

        const res1 = await service.claimWork(guildId, userId, config);
        expect(res1.ok).toBe(true);
        expect(res1.reward).toBeGreaterThanOrEqual(100);
        expect(res1.reward).toBeLessThanOrEqual(300);
        expect(res1.balance).toBe(res1.reward);
        expect(res1.job).toBeDefined();

        // Second attempt immediately should trigger cooldown
        const res2 = await service.claimWork(guildId, userId, config);
        expect(res2.ok).toBe(false);
        expect(res2.error).toBe('cooldown');
        expect(res2.nextAt).toBeGreaterThan(Date.now());
    });

    it('should respect custom rewards in configuration', async () => {
        const config = {
            work_cooldown_hours: 1,
            work_min_reward: 500,
            work_max_reward: 500
        };

        const res = await service.claimWork(guildId, 'user_custom_reward', config);
        expect(res.ok).toBe(true);
        expect(res.reward).toBe(500);
        expect(res.balance).toBe(500);
    });
});
