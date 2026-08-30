/**
 * tests/economy-info.test.js
 *
 * Tests unitaires pour /economy-info (Phase 13 G29).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db, ready } from '../src/db/index.js';
import { EconomyRepository } from '../src/modules/engagement_economy/services/economy.repository.js';
import { EconomyService } from '../src/modules/engagement_economy/services/economy.service.js';

describe('Feature G29: Economy Info Profile Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_info_123';
    const userId = 'usr_info_456';

    beforeAll(async () => {
        await ready;
    });

    beforeEach(async () => {
        repo = new EconomyRepository();
        service = new EconomyService(repo);
        await db.pool.query(`DELETE FROM user_economy WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM economy_boosts WHERE guild_id = $1`, [guildId]);
    });

    it('should aggregate profile info including wallet, bank and active boost', async () => {
        await repo.upsertBalance(guildId, userId, {
            balance: 500,
            bankBalance: 1200,
            totalEarned: 2000,
            totalSpent: 300,
            lastDailyClaimAt: 1700000000000,
            lastWorkClaimAt: 1700003600000
        });

        await service.addBoost(guildId, userId, 1.75, 7200);

        const profile = await service.getEconomyProfile(guildId, userId);
        expect(profile.wallet).toBe(500);
        expect(profile.bank).toBe(1200);
        expect(profile.total).toBe(1700);
        expect(profile.totalEarned).toBe(2000);
        expect(profile.totalSpent).toBe(300);
        expect(profile.activeBoost).not.toBeNull();
        expect(profile.activeBoost.multiplier).toBe(1.75);
    });
});
