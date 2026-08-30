/**
 * tests/confessions-service.test.js
 *
 * Tests unitaires et d'intégration pour ConfessionsService (Module P1).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { ConfessionsRepository } from '../src/modules/community_confessions/services/confessions.repository.js';
import { ConfessionsService } from '../src/modules/community_confessions/services/confessions.service.js';

describe('Specialized Bot Feature P1: Confessions Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_confess_123';
    const channelId = 'chan_confess_pub_456';
    const reviewChannelId = 'chan_confess_rev_789';
    const author1 = 'usr_author_1';
    const author2 = 'usr_author_2';

    beforeAll(async () => {
        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "confessions" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "number" integer NOT NULL,
                    "author_id" text NOT NULL,
                    "content" text NOT NULL,
                    "image_url" text,
                    "status" text DEFAULT 'published' NOT NULL,
                    "channel_id" text,
                    "message_id" text,
                    "review_message_id" text,
                    "parent_confession_id" text,
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint NOT NULL
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "confession_bans" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "reason" text,
                    "banned_by" text NOT NULL,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "confession_bans_guild_user_unique" UNIQUE("guild_id","user_id")
                );
            `);
        } catch (_) {}
    });

    beforeEach(async () => {
        repo = new ConfessionsRepository();
        service = new ConfessionsService(repo);
        await db.pool.query(`DELETE FROM confessions WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM confession_bans WHERE guild_id = $1`, [guildId]);
    });

    it('should submit instant anonymous confession and assign incremental numbers (#1, #2)', async () => {
        let sentMessage1 = null;
        let sentMessage2 = null;

        const mockClient = {
            channels: {
                cache: new Map([
                    [channelId, {
                        id: channelId,
                        send: async (payload) => {
                            if (!sentMessage1) {
                                sentMessage1 = payload;
                                return { id: 'msg_confess_1' };
                            } else {
                                sentMessage2 = payload;
                                return { id: 'msg_confess_2' };
                            }
                        }
                    }]
                ])
            }
        };

        const config = { channel_id: channelId, require_approval: false };

        const c1 = await service.submitConfession({
            guildId,
            authorId: author1,
            content: 'J’ai secrètement mangé tout le chocolat.',
            config,
            client: mockClient
        });

        expect(c1.ok).toBe(true);
        expect(c1.status).toBe('published');
        expect(c1.data.number).toBe(1);
        expect(sentMessage1).not.toBeNull();

        const c2 = await service.submitConfession({
            guildId,
            authorId: author2,
            content: 'J’ai vu qui a pris le chocolat !',
            config,
            client: mockClient
        });

        expect(c2.ok).toBe(true);
        expect(c2.data.number).toBe(2);
        expect(sentMessage2).not.toBeNull();
    });

    it('should submit reply to existing confession', async () => {
        const config = { channel_id: channelId, require_approval: false };
        const mockClient = {
            channels: {
                cache: new Map([
                    [channelId, {
                        id: channelId,
                        send: async () => ({ id: 'msg_pub' })
                    }]
                ])
            }
        };

        await service.submitConfession({
            guildId,
            authorId: author1,
            content: 'Première confession',
            config,
            client: mockClient
        });

        const reply = await service.submitConfession({
            guildId,
            authorId: author2,
            content: 'Réponse à la première confession',
            parentNumber: 1,
            config,
            client: mockClient
        });

        expect(reply.ok).toBe(true);
        expect(reply.data.number).toBe(2);
        expect(reply.data.parentConfessionId).not.toBeNull();
    });

    it('should handle review mode (require_approval = true) and approve confession', async () => {
        let sentReviewMessage = null;
        let sentPublicMessage = null;
        let editedReviewMessage = null;

        const mockClient = {
            channels: {
                cache: new Map([
                    [reviewChannelId, {
                        id: reviewChannelId,
                        send: async (payload) => {
                            sentReviewMessage = payload;
                            return { id: 'msg_review_111' };
                        },
                        messages: {
                            fetch: async (id) => ({
                                id,
                                edit: async (payload) => {
                                    editedReviewMessage = payload;
                                }
                            })
                        }
                    }],
                    [channelId, {
                        id: channelId,
                        send: async (payload) => {
                            sentPublicMessage = payload;
                            return { id: 'msg_public_222' };
                        }
                    }]
                ])
            }
        };

        const config = {
            channel_id: channelId,
            review_channel_id: reviewChannelId,
            require_approval: true
        };

        const sub = await service.submitConfession({
            guildId,
            authorId: author1,
            content: 'Confession sous révision',
            config,
            client: mockClient
        });

        expect(sub.ok).toBe(true);
        expect(sub.status).toBe('pending');
        expect(sentReviewMessage).not.toBeNull();
        expect(sentPublicMessage).toBeNull(); // Pas encore publique

        // Approbation par le staff
        const appRes = await service.approveConfession(sub.data.id, 'ModoAdmin', config, mockClient);
        expect(appRes.ok).toBe(true);
        expect(sentPublicMessage).not.toBeNull();
        expect(editedReviewMessage).not.toBeNull();

        const published = await repo.getConfessionById(sub.data.id);
        expect(published.status).toBe('published');
    });

    it('should prevent banned users from submitting confessions', async () => {
        await service.banUser(guildId, author1, 'Spam abusif', 'AdminMaster');

        const isBanned = await service.isUserBanned(guildId, author1);
        expect(isBanned).toBe(true);

        const sub = await service.submitConfession({
            guildId,
            authorId: author1,
            content: 'Je tente quand même...',
            config: { channel_id: channelId }
        });

        expect(sub.ok).toBe(false);
        expect(sub.error).toContain('banni');
    });

    it('should block confession containing blocked words', async () => {
        const config = {
            channel_id: channelId,
            blocked_words: ['insulte', 'spammer']
        };

        const sub = await service.submitConfession({
            guildId,
            authorId: author2,
            content: 'Ceci est une insulte gratuite !',
            config
        });

        expect(sub.ok).toBe(false);
        expect(sub.error).toContain('non autorisé');
    });
});
