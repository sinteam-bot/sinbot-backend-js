/**
 * tests/sticky-messages-service.test.js
 *
 * Tests unitaires pour StickyService (Phase 14 G28).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { StickyRepository } from '../src/modules/util_sticky_messages/services/sticky.repository.js';
import { StickyService } from '../src/modules/util_sticky_messages/services/sticky.service.js';

describe('Feature G28: Sticky Messages Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_sticky_123';
    const channelId = 'chan_sticky_456';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "sticky_messages" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "channel_id" text NOT NULL,
                "content" text NOT NULL,
                "embed_json" jsonb,
                "last_message_id" text,
                "cooldown_messages" integer DEFAULT 1 NOT NULL,
                "message_count_since_post" integer DEFAULT 0 NOT NULL,
                "created_at" bigint NOT NULL,
                "updated_at" bigint NOT NULL,
                CONSTRAINT "sticky_messages_guild_channel_unique" UNIQUE("guild_id","channel_id")
            );
        `);
    });

    beforeEach(async () => {
        repo = new StickyRepository();
        service = new StickyService(repo);
        await db.pool.query(`DELETE FROM sticky_messages WHERE guild_id = $1`, [guildId]);
    });

    it('should set, retrieve and remove sticky messages', async () => {
        const set = await service.setSticky({
            guildId,
            channelId,
            content: 'N’oubliez pas de respecter les règles !',
            cooldownMessages: 2
        });

        expect(set.ok).toBe(true);
        expect(set.data.content).toBe('N’oubliez pas de respecter les règles !');

        const sticky = await service.getSticky(guildId, channelId);
        expect(sticky).not.toBeNull();
        expect(sticky.cooldownMessages).toBe(2);

        await service.removeSticky(guildId, channelId);
        const after = await service.getSticky(guildId, channelId);
        expect(after).toBeNull();
    });

    it('onMessage should delete old sticky and repost new one when threshold reached', async () => {
        await repo.setSticky({
            guildId,
            channelId,
            content: 'Message collant persistant',
            cooldownMessages: 1
        });
        await repo.updateLastMessage(guildId, channelId, 'old_msg_111');

        let oldMessageDeleted = false;
        let newSentMessage = null;

        const mockClient = {
            channels: {
                cache: new Map([
                    [channelId, {
                        id: channelId,
                        messages: {
                            fetch: async (id) => {
                                if (id === 'old_msg_111') {
                                    return {
                                        delete: async () => { oldMessageDeleted = true; }
                                    };
                                }
                                return null;
                            }
                        },
                        send: async (p) => {
                            newSentMessage = p;
                            return { id: 'new_msg_222' };
                        }
                    }]
                ])
            }
        };

        const incomingMessage = {
            guild: { id: guildId },
            channel: { id: channelId },
            author: { id: 'some_user', bot: false },
            content: 'Bonjour tout le monde !'
        };

        await service.onMessage(incomingMessage, mockClient);

        expect(oldMessageDeleted).toBe(true);
        expect(newSentMessage).not.toBeNull();
        expect(newSentMessage.content).toContain('Message collant persistant');

        const updated = await repo.getSticky(guildId, channelId);
        expect(updated.lastMessageId).toBe('new_msg_222');
    });
});
