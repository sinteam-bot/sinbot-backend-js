/**
 * tests/autothread-service.test.js
 *
 * Tests unitaires et d'intégration pour AutoThreadService (Module P2).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { AutoThreadRepository } from '../src/modules/automation_autothread/services/autothread.repository.js';
import { AutoThreadService } from '../src/modules/automation_autothread/services/autothread.service.js';

describe('Specialized Bot Feature P2: Auto-Thread Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_thread_123';
    const channelId = 'chan_thread_456';
    const authorId = 'usr_author_789';

    beforeAll(async () => {
        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autothread_channels" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "channel_id" text NOT NULL,
                    "title_format" text DEFAULT '{author} - {message}' NOT NULL,
                    "intro_message" text,
                    "slowmode_seconds" integer DEFAULT 0 NOT NULL,
                    "auto_pin" boolean DEFAULT false NOT NULL,
                    "enabled" boolean DEFAULT true NOT NULL,
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint NOT NULL,
                    CONSTRAINT "autothread_channels_guild_channel_unique" UNIQUE("guild_id","channel_id")
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autothreads" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "parent_channel_id" text NOT NULL,
                    "thread_id" text NOT NULL,
                    "starter_message_id" text NOT NULL,
                    "author_id" text NOT NULL,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "autothreads_thread_id_unique" UNIQUE("thread_id")
                );
            `);
        } catch (_) {}
    });

    beforeEach(async () => {
        repo = new AutoThreadRepository();
        service = new AutoThreadService(repo);
        await db.pool.query(`DELETE FROM autothreads WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM autothread_channels WHERE guild_id = $1`, [guildId]);
    });

    it('formatThreadTitle should replace variables and clamp length', () => {
        const mockMsg = {
            member: { displayName: 'Alice' },
            author: { username: 'alice_w', tag: 'alice_w#1234' },
            content: 'Regardez mon nouveau projet de bot Discord !'
        };

        const title = service.formatThreadTitle('{author} | {message}', mockMsg);
        expect(title).toBe('Alice | Regardez mon nouveau projet de bot Discord !');

        // Test de longueur excessive (> 100)
        const longContent = 'A'.repeat(200);
        const longTitle = service.formatThreadTitle('{author} - {message}', { ...mockMsg, content: longContent });
        expect(longTitle.length).toBeLessThanOrEqual(100);
        expect(longTitle.endsWith('...')).toBe(true);
    });

    it('handleMessage should create thread, apply slowmode, autoPin, and save to DB', async () => {
        await service.setChannel({
            guildId,
            channelId,
            titleFormat: 'Projet : {message}',
            introMessage: 'Bienvenue dans le fil de {author} !',
            slowmodeSeconds: 10,
            autoPin: true,
            enabled: true
        });

        let pinned = false;
        let slowmodeSet = 0;
        let introSent = null;
        let createdThreadName = '';

        const mockThread = {
            id: 'thread_new_999',
            isThread: () => true,
            setRateLimitPerUser: async (s) => { slowmodeSet = s; },
            send: async (msg) => { introSent = msg; }
        };

        const mockMessage = {
            id: 'msg_starter_111',
            guild: { id: guildId },
            channel: { id: channelId, isThread: () => false, name: 'projets' },
            author: { id: authorId, username: 'Bob', bot: false },
            content: 'Mon portfolio en ligne',
            pin: async () => { pinned = true; },
            startThread: async ({ name }) => {
                createdThreadName = name;
                return mockThread;
            }
        };

        const resultThread = await service.handleMessage(mockMessage);

        expect(resultThread).not.toBeNull();
        expect(createdThreadName).toBe('Projet : Mon portfolio en ligne');
        expect(pinned).toBe(true);
        expect(slowmodeSet).toBe(10);
        expect(introSent).toContain(`<@${authorId}>`);

        const saved = await repo.getThread('thread_new_999');
        expect(saved).not.toBeNull();
        expect(saved.authorId).toBe(authorId);
    });

    it('renameThread should allow author or staff to rename', async () => {
        await repo.saveThread({
            guildId,
            parentChannelId: channelId,
            threadId: 'thread_test_rename',
            starterMessageId: 'msg_start',
            authorId
        });

        let renamedName = '';
        const mockThread = {
            id: 'thread_test_rename',
            isThread: () => true,
            setName: async (n) => { renamedName = n; }
        };

        // Auteur
        const resAuthor = await service.renameThread(mockThread, 'Nouveau Titre Auteur', authorId, false);
        expect(resAuthor.ok).toBe(true);
        expect(renamedName).toBe('Nouveau Titre Auteur');

        // Utilisateur non autorisé
        const resStranger = await service.renameThread(mockThread, 'Piratage', 'stranger_user', false);
        expect(resStranger.ok).toBe(false);

        // Modérateur
        const resStaff = await service.renameThread(mockThread, 'Titre Modéré', 'stranger_user', true);
        expect(resStaff.ok).toBe(true);
        expect(renamedName).toBe('Titre Modéré');
    });

    it('closeThread and lockThread should handle permissions and archivation', async () => {
        await repo.saveThread({
            guildId,
            parentChannelId: channelId,
            threadId: 'thread_test_close',
            starterMessageId: 'msg_start',
            authorId
        });

        let isArchived = false;
        let isLocked = false;

        const mockThread = {
            id: 'thread_test_close',
            isThread: () => true,
            setArchived: async (v) => { isArchived = v; },
            setLocked: async (v) => { isLocked = v; }
        };

        const resClose = await service.closeThread(mockThread, authorId, false);
        expect(resClose.ok).toBe(true);
        expect(isArchived).toBe(true);

        const resLockFail = await service.lockThread(mockThread, false);
        expect(resLockFail.ok).toBe(false);

        const resLockSuccess = await service.lockThread(mockThread, true);
        expect(resLockSuccess.ok).toBe(true);
        expect(isLocked).toBe(true);
    });
});
