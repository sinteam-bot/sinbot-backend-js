import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '../src/core/container.js';
import { StarboardService } from '../src/modules/community_starboard/services/starboard.service.js';
import { StarboardRepository } from '../src/modules/community_starboard/services/starboard.repository.js';
import { StarboardController } from '../src/modules/community_starboard/controllers/starboard.controller.js';
import { db } from '../src/db/index.js';

describe('Feature G05: Starboard Module Tests', () => {
    let service;
    let repo;
    let controller;

    const guildId = 'test_guild_starboard_123';
    const channelId = 'test_channel_starboard_456';
    const starboardChannelId = 'test_starboard_channel_789';

    beforeEach(async () => {
        repo = container.resolve(StarboardRepository);
        service = container.resolve(StarboardService);
        controller = container.resolve(StarboardController);

        await db.pool.query(`DELETE FROM starboard_entries WHERE guild_id = $1`, [guildId]);
    });

    it('Repository: should insert, update, retrieve and delete starboard entries', async () => {
        const entry = await repo.saveEntry({
            guildId,
            sourceChannelId: channelId,
            sourceMessageId: 'msg_001',
            starboardMessageId: 'star_001',
            authorId: 'author_123',
            reactionCount: 3,
            starredUsers: ['u1', 'u2', 'u3']
        });

        expect(entry).toBeDefined();
        expect(entry.reactionCount).toBe(3);
        expect(entry.starredUsers.length).toBe(3);

        const fetched = await repo.getEntry(guildId, 'msg_001');
        expect(fetched).toBeDefined();
        expect(fetched.starboardMessageId).toBe('star_001');

        await repo.saveEntry({
            ...fetched,
            reactionCount: 5
        });

        const updated = await repo.getEntry(guildId, 'msg_001');
        expect(updated.reactionCount).toBe(5);

        const top = await repo.listTopEntries(guildId, 5);
        expect(top.length).toBe(1);
        expect(top[0].reactionCount).toBe(5);

        await repo.deleteEntry(updated.id);
        const deleted = await repo.getEntry(guildId, 'msg_001');
        expect(deleted).toBeNull();
    });

    it('Service: should process reaction add and post to starboard channel when threshold reached', async () => {
        // Mock Discord Client & Channel
        const mockStarboardMessage = {
            id: 'star_posted_999',
            edit: vi.fn().mockResolvedValue(true),
            delete: vi.fn().mockResolvedValue(true)
        };

        const mockStarboardChannel = {
            id: starboardChannelId,
            isTextBased: () => true,
            send: vi.fn().mockResolvedValue(mockStarboardMessage),
            messages: {
                fetch: vi.fn().mockResolvedValue(mockStarboardMessage)
            }
        };

        const mockClient = {
            channels: {
                cache: new Map([[starboardChannelId, mockStarboardChannel]]),
                fetch: vi.fn().mockResolvedValue(mockStarboardChannel)
            }
        };

        // Mock config
        vi.spyOn(service, 'getConfig').mockReturnValue({
            enabled: true,
            channel_id: starboardChannelId,
            threshold: 2,
            emoji: '⭐',
            self_star: false,
            color: '#FEE75C'
        });

        const mockReaction = {
            emoji: { name: '⭐' },
            message: {
                id: 'msg_star_123',
                content: 'Incroyable message à garder !',
                guild: { id: guildId },
                channel: { id: channelId, nsfw: false },
                author: { id: 'author_original', username: 'OriginalAuthor', displayAvatarURL: () => 'https://example.com/avatar.png' },
                createdAt: new Date(),
                attachments: new Map(),
                url: 'https://discord.com/channels/123/456/789'
            },
            users: {
                fetch: vi.fn().mockResolvedValue(new Map([
                    ['u1', { id: 'u1', username: 'Fan1' }],
                    ['u2', { id: 'u2', username: 'Fan2' }]
                ]))
            }
        };

        const result = await service.handleReactionAdd(mockReaction, { id: 'u2', bot: false }, mockClient);
        expect(result.ok).toBe(true);
        expect(result.action).toBe('created');
        expect(result.starCount).toBe(2);
        expect(mockStarboardChannel.send).toHaveBeenCalledTimes(1);

        // Verify entry saved in DB
        const saved = await repo.getEntry(guildId, 'msg_star_123');
        expect(saved).toBeDefined();
        expect(saved.starboardMessageId).toBe('star_posted_999');
        expect(saved.reactionCount).toBe(2);
    });

    it('Service: should ignore invalid reaction or when threshold is not reached', async () => {
        vi.spyOn(service, 'getConfig').mockReturnValue({
            enabled: true,
            channel_id: starboardChannelId,
            threshold: 3,
            emoji: '⭐'
        });

        const mockReaction = {
            emoji: { name: '❤️' }, // Wrong emoji
            message: {
                id: 'msg_heart',
                guild: { id: guildId },
                channel: { id: channelId }
            }
        };

        const result = await service.handleReactionAdd(mockReaction, { id: 'u1', bot: false }, {});
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('emoji_mismatch');
    });

    it('Controller: should return status and list entries', async () => {
        await repo.saveEntry({
            guildId,
            sourceChannelId: channelId,
            sourceMessageId: 'ctrl_msg_1',
            starboardMessageId: 'ctrl_star_1',
            authorId: 'auth_1',
            reactionCount: 4
        });

        const statusRes = await controller.getStatus({ query: { guild_id: guildId } });
        expect(statusRes.success).toBe(true);
        expect(statusRes.data.stats.totalStarred).toBe(1);

        const entriesRes = await controller.getEntries({ query: { guild_id: guildId, limit: 10 } });
        expect(entriesRes.success).toBe(true);
        expect(entriesRes.data.length).toBe(1);
    });
});
