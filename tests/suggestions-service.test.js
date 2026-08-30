import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '../src/core/container.js';
import { SuggestionsService } from '../src/modules/community_suggestions/services/suggestions.service.js';
import { SuggestionsRepository } from '../src/modules/community_suggestions/services/suggestions.repository.js';
import { SuggestionsController } from '../src/modules/community_suggestions/controllers/suggestions.controller.js';
import { db } from '../src/db/index.js';

describe('Feature G12: Suggestions Module Tests', () => {
    let service;
    let repo;
    let controller;

    const guildId = 'test_guild_suggestions_123';
    const channelId = 'test_channel_suggestions_456';
    const userId = 'user_author_789';

    beforeEach(async () => {
        repo = container.resolve(SuggestionsRepository);
        service = container.resolve(SuggestionsService);
        controller = container.resolve(SuggestionsController);

        await db.pool.query(`DELETE FROM suggestions WHERE guild_id = $1`, [guildId]);
    });

    it('Repository: should auto-increment suggestion numbers and save suggestions', async () => {
        const next1 = await repo.getNextSuggestionNumber(guildId);
        expect(next1).toBe(1);

        const s1 = await repo.createSuggestion({
            guildId,
            userId,
            content: 'Ajouter un salon de jeux',
            suggestionNumber: next1
        });
        expect(s1.suggestionNumber).toBe(1);
        expect(s1.status).toBe('pending');

        const next2 = await repo.getNextSuggestionNumber(guildId);
        expect(next2).toBe(2);

        const s2 = await repo.createSuggestion({
            guildId,
            userId: 'user2',
            content: 'Ajouter des rôles personnalisés',
            suggestionNumber: next2
        });
        expect(s2.suggestionNumber).toBe(2);

        const count = await repo.countSuggestions(guildId);
        expect(count).toBe(2);

        const list = await repo.listSuggestions(guildId);
        expect(list.length).toBe(2);
    });

    it('Service: should submit suggestion, format embed, and add auto-reactions', async () => {
        const mockSentMsg = {
            id: 'msg_sug_999',
            react: vi.fn().mockResolvedValue(true),
            edit: vi.fn().mockResolvedValue(true)
        };

        const mockChannel = {
            id: channelId,
            isTextBased: () => true,
            send: vi.fn().mockResolvedValue(mockSentMsg),
            messages: {
                fetch: vi.fn().mockResolvedValue(mockSentMsg)
            }
        };

        const mockClient = {
            channels: {
                cache: new Map([[channelId, mockChannel]]),
                fetch: vi.fn().mockResolvedValue(mockChannel)
            },
            users: {
                fetch: vi.fn().mockResolvedValue({
                    id: userId,
                    username: 'TestAuthor',
                    bot: false,
                    send: vi.fn().mockResolvedValue(true)
                })
            }
        };

        vi.spyOn(service, 'getConfig').mockReturnValue({
            enabled: true,
            channel_id: channelId,
            auto_reactions: ['👍', '👎'],
            dm_notification: true
        });

        const res = await service.submitSuggestion(
            guildId,
            { id: userId, username: 'TestAuthor' },
            'Créer un tournoi hebdomadaire !',
            { client: mockClient }
        );

        expect(res.ok).toBe(true);
        expect(res.data.suggestionNumber).toBe(1);
        expect(mockChannel.send).toHaveBeenCalledTimes(1);
        expect(mockSentMsg.react).toHaveBeenCalledWith('👍');
        expect(mockSentMsg.react).toHaveBeenCalledWith('👎');

        // Test status update to 'approved'
        const updateRes = await service.updateStatus(
            guildId,
            1,
            'approved',
            { id: 'admin_1' },
            'Superbe idée, nous allons l\'organiser !',
            { client: mockClient }
        );

        expect(updateRes.ok).toBe(true);
        expect(updateRes.data.status).toBe('approved');
        expect(updateRes.data.staffReason).toContain('Superbe idée');
        expect(mockSentMsg.edit).toHaveBeenCalledTimes(1);
    });

    it('Controller: should list suggestions and filter by status', async () => {
        await repo.createSuggestion({
            guildId,
            userId,
            content: 'Suggestion 1',
            status: 'approved'
        });
        await repo.createSuggestion({
            guildId,
            userId,
            content: 'Suggestion 2',
            status: 'pending'
        });

        const statusRes = await controller.getStatus({ query: { guild_id: guildId } });
        expect(statusRes.success).toBe(true);
        expect(statusRes.data.stats.total).toBe(2);
        expect(statusRes.data.stats.approved).toBe(1);
        expect(statusRes.data.stats.pending).toBe(1);

        const listPending = await controller.listSuggestions({ query: { guild_id: guildId, status: 'pending' } });
        expect(listPending.success).toBe(true);
        expect(listPending.data.length).toBe(1);
        expect(listPending.data[0].content).toBe('Suggestion 2');
    });
});
