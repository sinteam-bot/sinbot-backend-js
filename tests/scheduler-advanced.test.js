/**
 * tests/scheduler-advanced.test.js
 *
 * Tests unitaires et d'intégration pour les fonctionnalités avancées de Scheduler (Module P6 - Message Planner Bot).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { SchedulerRepository } from '../src/modules/automation_scheduler/services/scheduler.repository.js';
import { SchedulerService } from '../src/modules/automation_scheduler/services/scheduler.service.js';

describe('Specialized Bot Feature P6: Message Planner Bot (One-time, Template Rotation, Auto-Clean)', () => {
    let repo;
    let service;
    const guildId = 'test_guild_sched_123';
    const channelId = 'chan_annonces_456';

    beforeAll(async () => {
        try {
            await db.pool.query(`ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'UTC';`);
        } catch (_) {}

        try {
            await db.pool.query(`ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "auto_clean" integer DEFAULT 0;`);
        } catch (_) {}

        try {
            await db.pool.query(`ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "last_message_id" text;`);
        } catch (_) {}

        try {
            await db.pool.query(`ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "template_id" text;`);
        } catch (_) {}

        try {
            await db.pool.query(`ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "is_one_time" integer DEFAULT 0;`);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "scheduled_messages" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "channel_id" text NOT NULL,
                    "name" text NOT NULL,
                    "content" text,
                    "embed_json" text,
                    "cron_expression" text,
                    "interval_minutes" integer,
                    "timezone" text DEFAULT 'UTC',
                    "auto_clean" integer DEFAULT 0 NOT NULL,
                    "last_message_id" text,
                    "template_id" text,
                    "is_one_time" integer DEFAULT 0 NOT NULL,
                    "next_run_at" bigint NOT NULL,
                    "last_run_at" bigint,
                    "enabled" integer DEFAULT 1 NOT NULL,
                    "created_by" text,
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint NOT NULL
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "scheduler_templates" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "name" text NOT NULL,
                    "items" jsonb NOT NULL,
                    "current_index" integer DEFAULT 0 NOT NULL,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "scheduler_templates_guild_name_unique" UNIQUE("guild_id","name")
                );
            `);
        } catch (_) {}
    });

    beforeEach(async () => {
        repo = new SchedulerRepository();
        service = new SchedulerService(repo);

        await db.pool.query(`DELETE FROM scheduler_templates WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM scheduled_messages WHERE guild_id = $1`, [guildId]);
    });

    it('should create and execute a One-time schedule, then auto-disable it', async () => {
        const runTimestamp = Date.now() + 5000;
        const res = await service.createScheduledMessage({
            guildId,
            name: 'annonce_event',
            channelId,
            content: '🎉 L’événement commence maintenant !',
            isOneTime: true,
            runAtTimestamp: runTimestamp
        });

        expect(res.ok).toBe(true);
        expect(res.data.isOneTime).toBe(true);
        expect(res.data.nextRunAt).toBe(runTimestamp);

        let sentContent = null;
        const mockChannel = {
            id: channelId,
            name: 'annonces',
            isTextBased: () => true,
            guild: { id: guildId },
            send: async (payload) => {
                sentContent = payload.content;
                return { id: 'msg_sent_123' };
            }
        };

        const mockClient = {
            channels: {
                cache: new Map([[channelId, mockChannel]])
            }
        };

        await service.executeScheduledMessage(res.data, mockClient, Date.now());

        expect(sentContent).toBe('🎉 L’événement commence maintenant !');

        const after = await service.get(res.data.id);
        expect(after.enabled).toBe(false); // One-time -> auto-disabled
        expect(after.lastMessageId).toBe('msg_sent_123');
    });

    it('should rotate templates across scheduled executions', async () => {
        await service.createTemplate({
            guildId,
            name: 'astuces',
            items: [
                '💡 Astuce 1 : Pensez à faire vos quêtes quotidiennes !',
                '💡 Astuce 2 : Utilisez /help pour découvrir toutes les commandes !'
            ]
        });

        const res = await service.createScheduledMessage({
            guildId,
            name: 'astuce_quotidienne',
            channelId,
            templateId: 'astuces',
            intervalMinutes: 1440
        });

        expect(res.ok).toBe(true);

        const sentMessages = [];
        const mockChannel = {
            id: channelId,
            name: 'annonces',
            isTextBased: () => true,
            guild: { id: guildId },
            send: async (payload) => {
                sentMessages.push(payload.content);
                return { id: `msg_${sentMessages.length}` };
            }
        };

        const mockClient = {
            channels: {
                cache: new Map([[channelId, mockChannel]])
            }
        };

        // 1ère exécution -> Astuce 1
        await service.executeScheduledMessage(res.data, mockClient, Date.now());
        expect(sentMessages[0]).toContain('Astuce 1');

        // 2ème exécution -> Astuce 2
        await service.executeScheduledMessage(res.data, mockClient, Date.now() + 1000);
        expect(sentMessages[1]).toContain('Astuce 2');

        // 3ème exécution -> Retour à Astuce 1 (rotation circulaire)
        await service.executeScheduledMessage(res.data, mockClient, Date.now() + 2000);
        expect(sentMessages[2]).toContain('Astuce 1');
    });

    it('should delete previous message when Auto-Clean is enabled', async () => {
        let deletedOldMessageId = null;

        const mockOldMessage = {
            id: 'msg_old_to_clean',
            delete: async () => { deletedOldMessageId = 'msg_old_to_clean'; }
        };

        const mockChannel = {
            id: channelId,
            name: 'annonces',
            isTextBased: () => true,
            guild: { id: guildId },
            messages: {
                fetch: async (id) => id === 'msg_old_to_clean' ? mockOldMessage : null
            },
            send: async () => ({ id: 'msg_new_456' })
        };

        const mockClient = {
            channels: {
                cache: new Map([[channelId, mockChannel]])
            }
        };

        const res = await service.createScheduledMessage({
            guildId,
            name: 'stats_live',
            channelId,
            content: '📊 Statistiques du serveur à jour.',
            autoClean: true,
            intervalMinutes: 30
        });

        // Simuler qu'un message précédent existait
        await repo.updateScheduledMessage(res.data.id, { last_message_id: 'msg_old_to_clean' });
        const updated = await repo.getScheduledMessage(res.data.id);

        await service.executeScheduledMessage(updated, mockClient, Date.now());

        expect(deletedOldMessageId).toBe('msg_old_to_clean');

        const after = await repo.getScheduledMessage(res.data.id);
        expect(after.lastMessageId).toBe('msg_new_456');
    });
});
