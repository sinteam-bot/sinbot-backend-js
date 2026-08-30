/**
 * tests/economy-boosts.test.js
 *
 * Tests unitaires et d'intégration pour les boosts économiques (Phase 13 G11).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { EconomyRepository } from '../src/modules/engagement_economy/services/economy.repository.js';
import { EconomyService } from '../src/modules/engagement_economy/services/economy.service.js';

describe('Feature G11: Economy Boosts Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_boost_123';
    const userId = 'usr_boost_456';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "user_economy" (
                "user_id" text NOT NULL,
                "guild_id" text NOT NULL,
                "balance" integer DEFAULT 0 NOT NULL,
                "bank_balance" integer DEFAULT 0 NOT NULL,
                "last_daily_claim_at" bigint,
                "last_work_claim_at" bigint,
                "total_earned" integer DEFAULT 0 NOT NULL,
                "total_spent" integer DEFAULT 0 NOT NULL,
                "created_at" bigint NOT NULL,
                "updated_at" bigint NOT NULL,
                CONSTRAINT "user_economy_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
            );
            CREATE TABLE IF NOT EXISTS "economy_transactions" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "user_id" text NOT NULL,
                "amount" integer NOT NULL,
                "type" text NOT NULL,
                "counterparty_id" text,
                "reason" text,
                "metadata" jsonb,
                "created_at" bigint NOT NULL
            );
            CREATE TABLE IF NOT EXISTS "economy_boosts" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "user_id" text NOT NULL,
                "multiplier" numeric(5, 2) NOT NULL,
                "expires_at" bigint NOT NULL,
                "created_at" bigint NOT NULL
            );
        `);
    });

    beforeEach(async () => {
        repo = new EconomyRepository();
        service = new EconomyService(repo);
        await db.pool.query(`DELETE FROM economy_boosts WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM user_economy WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM economy_transactions WHERE guild_id = $1`, [guildId]);
    });

    it('should add boost and retrieve active boost correctly', async () => {
        const res = await service.addBoost(guildId, userId, 2.0, 3600);
        expect(res.ok).toBe(true);
        expect(res.data.multiplier).toBe(2.0);
        expect(res.data.expiresAt).toBeGreaterThan(Date.now());

        const active = await service.getActiveBoost(guildId, userId);
        expect(active).not.toBeNull();
        expect(active.multiplier).toBe(2.0);
    });

    it('claimDaily should apply active boost multiplier to reward', async () => {
        // Base reward = 100
        // With boost 2.5x -> reward = 250
        await service.addBoost(guildId, userId, 2.5, 3600);

        const res = await service.claimDaily(guildId, userId, { daily_reward: 100 });
        expect(res.ok).toBe(true);
        expect(res.boostActive).toBe(true);
        expect(res.multiplier).toBe(2.5);
        expect(res.reward).toBe(250);
        expect(res.balance).toBe(250);
    });

    it('claimWork should apply active boost multiplier to reward', async () => {
        // Boost 1.5x
        await service.addBoost(guildId, userId, 1.5, 3600);

        const res = await service.claimWork(guildId, userId, {
            work_min_reward: 100,
            work_max_reward: 100,
            work_cooldown_hours: 1
        });

        expect(res.ok).toBe(true);
        expect(res.boostActive).toBe(true);
        expect(res.multiplier).toBe(1.5);
        expect(res.reward).toBe(150); // 100 * 1.5
        expect(res.balance).toBe(150);
    });
});
