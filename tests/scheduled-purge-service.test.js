/**
 * tests/scheduled-purge-service.test.js
 *
 * Tests unitaires et d'intégration pour ScheduledPurgeService (Phase 12 G39).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { ScheduledPurgeRepository } from '../src/modules/security_automod/services/scheduled-purge.repository.js';
import { ScheduledPurgeService } from '../src/modules/security_automod/services/scheduled-purge.service.js';

describe('Feature G39: Scheduled Purge Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_purge_123';
    const channelId = 'chan_purge_456';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "scheduled_purges" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "channel_id" text NOT NULL,
                "interval_hours" integer NOT NULL,
                "keep_pinned" boolean DEFAULT true NOT NULL,
                "last_purge_at" bigint DEFAULT 0 NOT NULL,
                "created_at" bigint NOT NULL,
                CONSTRAINT "scheduled_purges_guild_channel_unique" UNIQUE("guild_id","channel_id")
            );
        `);
    });

    beforeEach(async () => {
        repo = new ScheduledPurgeRepository();
        service = new ScheduledPurgeService(repo);
        await db.pool.query(`DELETE FROM scheduled_purges WHERE guild_id = $1`, [guildId]);
    });

    it('should setup, list and delete scheduled purges', async () => {
        const setup = await service.setupPurge({
            guildId,
            channelId,
            intervalHours: 12,
            keepPinned: true
        });

        expect(setup.ok).toBe(true);
        expect(setup.data.channelId).toBe(channelId);
        expect(setup.data.intervalHours).toBe(12);
        expect(setup.data.keepPinned).toBe(true);

        const list = await service.listPurges(guildId);
        expect(list.length).toBe(1);

        const del = await service.deletePurge(guildId, channelId);
        expect(del.ok).toBe(true);

        const listAfter = await service.listPurges(guildId);
        expect(listAfter.length).toBe(0);
    });

    it('executeDuePurges should bulk delete non-pinned messages on due channels', async () => {
        await repo.setupPurge({
            guildId,
            channelId,
            intervalHours: 6,
            keepPinned: true
        });

        let deletedMessages = [];
        const mockMessages = new Map([
            ['m1', { id: 'm1', pinned: false }],
            ['m2', { id: 'm2', pinned: true }], // pinned message
            ['m3', { id: 'm3', pinned: false }]
        ]);

        const mockClient = {
            channels: {
                cache: new Map([
                    [channelId, {
                        id: channelId,
                        name: 'bot-commands',
                        messages: {
                            fetch: async () => mockMessages
                        },
                        bulkDelete: async (toDel) => {
                            deletedMessages = toDel;
                        }
                    }]
                ])
            }
        };

        await service.executeDuePurges(mockClient);

        // m2 is pinned, so only m1 and m3 should be deleted
        expect(deletedMessages.length).toBe(2);
        expect(deletedMessages.map(m => m.id)).toEqual(['m1', 'm3']);

        const purgeRecord = await repo.getPurge(guildId, channelId);
        expect(purgeRecord.lastPurgeAt).toBeGreaterThan(0);
    });
});
