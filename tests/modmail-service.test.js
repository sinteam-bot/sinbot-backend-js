/**
 * tests/modmail-service.test.js
 *
 * Tests unitaires et d'intégration pour ModMailService (Module P3).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { ModMailRepository } from '../src/modules/community_modmail/services/modmail.repository.js';
import { ModMailService } from '../src/modules/community_modmail/services/modmail.service.js';

describe('Specialized Bot Feature P3: ModMail Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_modmail_123';
    const staffChannelId = 'chan_staff_mail_456';
    const userId = 'usr_modmail_client_789';
    const staffId = 'usr_modmail_staff_111';

    beforeAll(async () => {
        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "modmail_threads" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "channel_id" text NOT NULL,
                    "status" text DEFAULT 'open' NOT NULL,
                    "created_at" bigint NOT NULL,
                    "closed_at" bigint,
                    "closed_by" text,
                    "close_reason" text
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "modmail_messages" (
                    "id" text PRIMARY KEY NOT NULL,
                    "thread_id" text NOT NULL,
                    "sender_type" text NOT NULL,
                    "sender_id" text NOT NULL,
                    "sender_name" text NOT NULL,
                    "content" text NOT NULL,
                    "is_anonymous" boolean DEFAULT false NOT NULL,
                    "created_at" bigint NOT NULL
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "modmail_bans" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "reason" text,
                    "banned_by" text NOT NULL,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "modmail_bans_guild_user_unique" UNIQUE("guild_id","user_id")
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "modmail_snippets" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "name" text NOT NULL,
                    "content" text NOT NULL,
                    "created_by" text NOT NULL,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "modmail_snippets_guild_name_unique" UNIQUE("guild_id","name")
                );
            `);
        } catch (_) {}
    });

    beforeEach(async () => {
        repo = new ModMailRepository();
        service = new ModMailService(repo);
        await db.pool.query(`DELETE FROM modmail_messages`);
        await db.pool.query(`DELETE FROM modmail_threads WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM modmail_bans WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM modmail_snippets WHERE guild_id = $1`, [guildId]);
    });

    it('handleUserDM should create channel, send greeting, and relay message to staff channel', async () => {
        let sentGreeting = null;
        let createdChannelPayload = null;
        let staffChannelMessages = [];

        const mockStaffChannel = {
            id: staffChannelId,
            send: async (payload) => {
                staffChannelMessages.push(payload);
                return { id: 'msg_staff_1' };
            }
        };

        const mockGuild = {
            id: guildId,
            channels: {
                cache: new Map([[staffChannelId, mockStaffChannel]]),
                create: async (payload) => {
                    createdChannelPayload = payload;
                    return mockStaffChannel;
                }
            }
        };

        const mockClient = {
            guilds: {
                cache: new Map([[guildId, mockGuild]])
            }
        };

        const mockMessage = {
            author: {
                id: userId,
                tag: 'ClientUser#1234',
                username: 'ClientUser',
                bot: false,
                createdTimestamp: Date.now() - 100000,
                displayAvatarURL: () => 'http://example.com/avatar.png',
                send: async (text) => { sentGreeting = text; }
            },
            content: 'Bonjour, j’ai une question sur mon rôle.'
        };

        const config = {
            guild_id: guildId,
            greeting_message: 'Bienvenue au support !'
        };

        await service.handleUserDM(mockMessage, mockClient, config);

        expect(createdChannelPayload).not.toBeNull();
        expect(createdChannelPayload.name).toBe('mail-clientuser');
        expect(sentGreeting).toBe('Bienvenue au support !');
        expect(staffChannelMessages.length).toBe(2); // header + first user message

        const activeThread = await repo.getActiveThreadByUser(guildId, userId);
        expect(activeThread).not.toBeNull();
        expect(activeThread.channelId).toBe(staffChannelId);
    });

    it('replyToUser should send DM to user (normal and anonymous) and save message', async () => {
        const thread = await repo.createThread({
            guildId,
            userId,
            channelId: staffChannelId
        });

        let userDMs = [];
        let staffConfirmations = [];

        const mockTargetUser = {
            id: userId,
            tag: 'ClientUser#1234',
            send: async (payload) => { userDMs.push(payload); }
        };

        const mockStaffChannel = {
            id: staffChannelId,
            send: async (payload) => { staffConfirmations.push(payload); }
        };

        const mockClient = {
            user: { displayAvatarURL: () => 'http://example.com/bot.png' },
            users: {
                fetch: async (id) => id === userId ? mockTargetUser : null
            },
            channels: {
                cache: new Map([[staffChannelId, mockStaffChannel]])
            }
        };

        const staffMember = {
            id: staffId,
            username: 'SuperModo',
            displayName: 'SuperModo',
            displayAvatarURL: () => 'http://example.com/staff.png'
        };

        // 1. Réponse publique
        const repPublic = await service.replyToUser({
            channelId: staffChannelId,
            staffUser: staffMember,
            content: 'Voici la solution à votre problème.',
            isAnonymous: false,
            client: mockClient
        });

        expect(repPublic.ok).toBe(true);
        expect(userDMs.length).toBe(1);
        expect(userDMs[0].embeds[0].data.author.name).toBe('SuperModo');

        // 2. Réponse anonyme
        const repAnon = await service.replyToUser({
            channelId: staffChannelId,
            staffUser: staffMember,
            content: 'Message du staff anonyme.',
            isAnonymous: true,
            client: mockClient
        });

        expect(repAnon.ok).toBe(true);
        expect(userDMs.length).toBe(2);
        expect(userDMs[1].embeds[0].data.author.name).toBe('Staff de Serveur');

        const msgs = await service.getThreadMessages(thread.id);
        expect(msgs.length).toBe(2);
        expect(msgs[1].isAnonymous).toBe(true);
    });

    it('closeThread should close DB record, notify user and delete staff channel', async () => {
        await repo.createThread({
            guildId,
            userId,
            channelId: staffChannelId
        });

        let closeDmSent = null;
        let channelDeleted = false;

        const mockTargetUser = {
            id: userId,
            send: async (payload) => { closeDmSent = payload; }
        };

        const mockStaffChannel = {
            id: staffChannelId,
            delete: async () => { channelDeleted = true; }
        };

        const mockClient = {
            users: {
                fetch: async (id) => id === userId ? mockTargetUser : null
            },
            channels: {
                cache: new Map([[staffChannelId, mockStaffChannel]])
            }
        };

        const res = await service.closeThread({
            channelId: staffChannelId,
            closedBy: 'ModoMaster',
            reason: 'Ticket résolu',
            client: mockClient
        });

        expect(res.ok).toBe(true);
        expect(closeDmSent).not.toBeNull();
        expect(channelDeleted).toBe(true);

        const after = await repo.getActiveThreadByUser(guildId, userId);
        expect(after).toBeNull();
    });

    it('should manage snippets properly', async () => {
        await service.setSnippet({
            guildId,
            name: 'regles',
            content: 'Veuillez lire attentivement les règles du serveur.',
            createdBy: staffId
        });

        const snip = await service.getSnippet(guildId, 'regles');
        expect(snip).not.toBeNull();
        expect(snip.content).toContain('règles');

        const list = await service.listSnippets(guildId);
        expect(list.length).toBe(1);

        await service.deleteSnippet(guildId, 'regles');
        const listAfter = await service.listSnippets(guildId);
        expect(listAfter.length).toBe(0);
    });

    it('should block banned users from sending modmail', async () => {
        await service.banUser(guildId, userId, 'Spam abusif', staffId);
        const isBanned = await service.isUserBanned(guildId, userId);
        expect(isBanned).toBe(true);

        let dmSent = false;
        const mockMessage = {
            author: { id: userId, bot: false, send: async () => { dmSent = true; } },
            content: 'Je veux parler au staff !'
        };
        const mockClient = { guilds: { cache: new Map() } };

        await service.handleUserDM(mockMessage, mockClient, { guild_id: guildId });
        expect(dmSent).toBe(false);
    });
});
