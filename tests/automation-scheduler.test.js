/**
 * tests/automation-scheduler.test.js
 *
 * Tests unitaires et d'intégration pour Automation Scheduler (Phase 8 G03).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { SchedulerRepository } from '../src/modules/automation_scheduler/services/scheduler.repository.js';
import { SchedulerService } from '../src/modules/automation_scheduler/services/scheduler.service.js';

describe('Feature G03: Automation Scheduler Module Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_scheduler_123';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS scheduled_messages (
                id text PRIMARY KEY NOT NULL,
                guild_id text NOT NULL,
                channel_id text NOT NULL,
                name text NOT NULL,
                content text,
                embed_json text,
                cron_expression text,
                interval_minutes integer,
                next_run_at bigint NOT NULL,
                last_run_at bigint,
                enabled integer DEFAULT 1 NOT NULL,
                created_by text,
                created_at bigint NOT NULL,
                updated_at bigint NOT NULL
            );
        `);
    });

    beforeEach(async () => {
        repo = new SchedulerRepository();
        service = new SchedulerService(repo);

        await db.pool.query(`DELETE FROM scheduled_messages WHERE guild_id = $1`, [guildId]);
    });

    it('should create a scheduled message with interval', async () => {
        const res = await service.createScheduledMessage({
            guildId,
            name: 'rappel_vocal',
            channelId: 'chan_general_999',
            content: 'N’oubliez pas le vocal ce soir à 21h !',
            intervalMinutes: 120,
            createdBy: 'admin_1'
        });

        expect(res.ok).toBe(true);
        expect(res.data.name).toBe('rappel_vocal');
        expect(res.data.channelId).toBe('chan_general_999');
        expect(res.data.intervalMinutes).toBe(120);
        expect(res.data.enabled).toBe(true);
        expect(res.data.nextRunAt).toBeGreaterThan(Date.now());
    });

    it('should reject duplicate name on the same guild', async () => {
        await service.createScheduledMessage({
            guildId,
            name: 'annonce',
            channelId: 'chan_1',
            content: 'Hello'
        });

        const resDup = await service.createScheduledMessage({
            guildId,
            name: 'annonce',
            channelId: 'chan_2',
            content: 'Hello again'
        });

        expect(resDup.ok).toBe(false);
        expect(resDup.error).toContain('existe déjà');
    });

    it('should toggle enabled status and delete message', async () => {
        const res = await service.createScheduledMessage({
            guildId,
            name: 'pause_test',
            channelId: 'chan_1',
            content: 'Texte'
        });

        // Toggle to disabled
        const toggle1 = await service.toggle(res.data.id);
        expect(toggle1.ok).toBe(true);
        expect(toggle1.data.enabled).toBe(false);

        // Toggle back to enabled
        const toggle2 = await service.toggle(res.data.id);
        expect(toggle2.ok).toBe(true);
        expect(toggle2.data.enabled).toBe(true);

        // Delete
        const delRes = await service.delete(res.data.id);
        expect(delRes.ok).toBe(true);

        const list = await service.list(guildId);
        expect(list.length).toBe(0);
    });

    it('should find due messages and execute them', async () => {
        const sentMessages = [];
        const mockClient = {
            channels: {
                cache: new Map(),
                async fetch(id) {
                    return {
                        id,
                        name: 'general',
                        guild: { name: 'Test Guild', id: guildId },
                        isTextBased: () => true,
                        send: async (payload) => {
                            sentMessages.push({ id, payload });
                        }
                    };
                }
            }
        };

        // Insert message directly with past nextRunAt
        const created = await repo.insertScheduledMessage({
            guildId,
            name: 'due_msg',
            channelId: 'chan_due_1',
            content: 'Message automatique {server.name}',
            intervalMinutes: 60,
            nextRunAt: Date.now() - 1000,
            enabled: true
        });

        await service.checkAndRunDueMessages(mockClient);

        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].payload.content).toBe('Message automatique Test Guild');

        // Check that nextRunAt was updated
        const updated = await repo.getScheduledMessage(created.id);
        expect(updated.nextRunAt).toBeGreaterThan(Date.now());
        expect(updated.lastRunAt).toBeGreaterThan(0);
    });
});
