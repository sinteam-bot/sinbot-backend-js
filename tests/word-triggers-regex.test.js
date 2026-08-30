/**
 * tests/word-triggers-regex.test.js
 *
 * Tests unitaires pour WordTriggers avec support Regex (G02) et Positive Conditions (G30).
 */

import { describe, it, expect } from 'vitest';
import { WordTriggerService } from '../src/modules/util_word_triggers/services/word-trigger.service.js';

function createMockRepo() {
    const items = new Map();
    return {
        async insertTrigger(t) {
            const id = t.id || `wt_${items.size + 1}`;
            const row = {
                id,
                guildId: t.guildId,
                triggerText: t.triggerText,
                matchType: t.matchType || 'exact',
                responseText: t.responseText || null,
                responseEmbed: t.responseEmbedJson ? JSON.parse(t.responseEmbedJson) : null,
                excludeChannelIds: t.excludeChannelIdsJson ? JSON.parse(t.excludeChannelIdsJson) : [],
                excludeRoleIds: t.excludeRoleIdsJson ? JSON.parse(t.excludeRoleIdsJson) : [],
                requiredRoleIds: t.requiredRoleIdsJson ? JSON.parse(t.requiredRoleIdsJson) : [],
                cooldownSeconds: t.cooldownSeconds ?? 10,
                createdBy: t.createdBy || null
            };
            items.set(id, row);
            return row;
        },
        async getTrigger(id) { return items.get(id) || null; },
        async listTriggers(guildId) {
            return [...items.values()].filter(t => t.guildId === guildId);
        },
        async deleteTrigger(id) { return items.delete(id); }
    };
}

describe('Feature G02 & G30: Word Triggers Regex & Positive Conditions', () => {
    it('should validate and create regex triggers', async () => {
        const repo = createMockRepo();
        const service = new WordTriggerService(repo);

        // Invalid regex
        const invalidRes = await service.create({
            guildId: 'g1',
            triggerText: '[unclosed-bracket',
            matchType: 'regex',
            responseText: 'Error!'
        });
        expect(invalidRes.ok).toBe(false);
        expect(invalidRes.error).toBe('invalid_regex');

        // Valid regex
        const validRes = await service.create({
            guildId: 'g1',
            triggerText: '^bonjour (tout le monde|tous)!?$',
            matchType: 'regex',
            responseText: 'Salut à toi !'
        });
        expect(validRes.ok).toBe(true);
        expect(validRes.data.matchType).toBe('regex');
    });

    it('should match regex patterns correctly', async () => {
        const repo = createMockRepo();
        const service = new WordTriggerService(repo);

        await service.create({
            guildId: 'g1',
            triggerText: '\\b(salut|hey|coucou)\\b',
            matchType: 'regex',
            responseText: 'Hello !'
        });

        // Match
        const match1 = await service.findMatching('g1', 'Coucou les amis');
        expect(match1).not.toBeNull();
        expect(match1.responseText).toBe('Hello !');

        // No match
        const match2 = await service.findMatching('g1', 'Au revoir les amis');
        expect(match2).toBeNull();
    });

    it('should enforce positive conditions (required_roles G30)', async () => {
        const repo = createMockRepo();
        const service = new WordTriggerService(repo);

        const trigger = {
            id: 't1',
            guildId: 'g1',
            triggerText: 'vip',
            requiredRoleIds: ['role_vip_123'],
            cooldownSeconds: 0
        };

        const memberWithoutVip = {
            roles: {
                cache: new Map([['role_member', { id: 'role_member' }]])
            }
        };

        const memberWithVip = {
            roles: {
                cache: new Map([['role_vip_123', { id: 'role_vip_123' }]])
            }
        };

        const check1 = service.shouldFire(trigger, { channelId: 'c1' }, memberWithoutVip);
        expect(check1.ok).toBe(false);
        expect(check1.reason).toBe('role_required');

        const check2 = service.shouldFire(trigger, { channelId: 'c1' }, memberWithVip);
        expect(check2.ok).toBe(true);
    });
});
