/**
 * tests/highlights-service.test.js
 *
 * Tests unitaires pour HighlightsService (Phase 14 G22).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { HighlightsRepository } from '../src/modules/util_highlights/services/highlights.repository.js';
import { HighlightsService } from '../src/modules/util_highlights/services/highlights.service.js';

describe('Feature G22: Highlights Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_hl_123';
    const subscriberId = 'usr_subscriber_456';
    const authorId = 'usr_author_789';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "user_highlights" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "user_id" text NOT NULL,
                "keyword" text NOT NULL,
                "created_at" bigint NOT NULL,
                CONSTRAINT "user_highlights_guild_user_keyword_unique" UNIQUE("guild_id","user_id","keyword")
            );
        `);
    });

    beforeEach(async () => {
        repo = new HighlightsRepository();
        service = new HighlightsService(repo);
        await db.pool.query(`DELETE FROM user_highlights WHERE guild_id = $1`, [guildId]);
    });

    it('should add, list and remove keywords for a user', async () => {
        const add = await service.addKeyword(guildId, subscriberId, 'minecraft');
        expect(add.ok).toBe(true);

        const list = await service.listKeywords(guildId, subscriberId);
        expect(list.length).toBe(1);
        expect(list[0].keyword).toBe('minecraft');

        await service.removeKeyword(guildId, subscriberId, 'minecraft');
        const listAfter = await service.listKeywords(guildId, subscriberId);
        expect(listAfter.length).toBe(0);
    });

    it('checkAndNotify should send DM when keyword is mentioned by someone else', async () => {
        await service.addKeyword(guildId, subscriberId, 'valorant');

        let dmSentPayload = null;
        const mockClient = {
            users: {
                cache: new Map([
                    [subscriberId, {
                        id: subscriberId,
                        send: async (payload) => {
                            dmSentPayload = payload;
                        }
                    }]
                ])
            }
        };

        const mockMessage = {
            guild: { id: guildId, name: 'Test Server' },
            channel: { id: 'chan_general' },
            id: 'msg_123',
            author: { id: authorId, bot: false },
            content: 'Qui est chaud pour faire un Valorant ce soir ?'
        };

        await service.checkAndNotify(mockMessage, mockClient);
        expect(dmSentPayload).not.toBeNull();
        expect(dmSentPayload.embeds.length).toBe(1);
    });

    it('checkAndNotify should not trigger DM if the author mentions their own keyword', async () => {
        await service.addKeyword(guildId, subscriberId, 'valorant');

        let dmSentPayload = null;
        const mockClient = {
            users: {
                cache: new Map([
                    [subscriberId, {
                        id: subscriberId,
                        send: async (p) => { dmSentPayload = p; }
                    }]
                ])
            }
        };

        const mockMessage = {
            guild: { id: guildId, name: 'Test Server' },
            channel: { id: 'chan_general' },
            id: 'msg_123',
            author: { id: subscriberId, bot: false }, // same author
            content: 'Je lance un Valorant !'
        };

        await service.checkAndNotify(mockMessage, mockClient);
        expect(dmSentPayload).toBeNull();
    });
});
