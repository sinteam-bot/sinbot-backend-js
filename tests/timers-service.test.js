/**
 * tests/timers-service.test.js
 *
 * Tests unitaires pour TimersService (Phase 14 G24).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { TimersRepository } from '../src/modules/util_timers/services/timers.repository.js';
import { TimersService } from '../src/modules/util_timers/services/timers.service.js';

describe('Feature G24: Timers Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_timer_123';
    const channelId = 'chan_timer_456';
    const userId = 'usr_timer_789';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "user_timers" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "channel_id" text NOT NULL,
                "user_id" text NOT NULL,
                "label" text NOT NULL,
                "duration_seconds" integer NOT NULL,
                "ends_at" bigint NOT NULL,
                "notified" boolean DEFAULT false NOT NULL,
                "created_at" bigint NOT NULL
            );
        `);
    });

    beforeEach(async () => {
        repo = new TimersRepository();
        service = new TimersService(repo);
        await db.pool.query(`DELETE FROM user_timers WHERE guild_id = $1`, [guildId]);
    });

    it('should create and list active timers', async () => {
        const created = await service.createTimer({
            guildId,
            channelId,
            userId,
            label: 'Cuisson des pâtes',
            durationSeconds: 600
        });

        expect(created.ok).toBe(true);
        expect(created.data.label).toBe('Cuisson des pâtes');
        expect(created.data.durationSeconds).toBe(600);

        const list = await service.listTimers(guildId, userId);
        expect(list.length).toBe(1);
    });

    it('processDueTimers should notify user and mark timer as notified', async () => {
        // Timer créé avec ends_at dans le passé
        await db.pool.query(
            `INSERT INTO user_timers (id, guild_id, channel_id, user_id, label, duration_seconds, ends_at, notified, created_at)
             VALUES ('timer_due_1', $1, $2, $3, 'Rappel réunion', 300, $4, false, $5)`,
            [guildId, channelId, userId, Date.now() - 1000, Date.now() - 301000]
        );

        let sentMessage = null;
        const mockClient = {
            channels: {
                cache: new Map([
                    [channelId, {
                        id: channelId,
                        send: async (msg) => { sentMessage = msg; }
                    }]
                ])
            }
        };

        await service.processDueTimers(mockClient);
        expect(sentMessage).not.toBeNull();
        expect(sentMessage.content).toContain(userId);

        const listAfter = await service.listTimers(guildId, userId);
        expect(listAfter.length).toBe(0); // Notified = true, donc non listé
    });
});
