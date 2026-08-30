/**
 * tests/giveaways-advanced.test.js
 *
 * Tests unitaires pour G32 (rôles & tirage pondéré) et G33 (liens de partage).
 */

import { describe, it, expect } from 'vitest';
import { GiveawayService } from '../src/modules/util_giveaways/services/giveaway.service.js';

describe('Features G32 & G33: Advanced Giveaways Tests', () => {
    it('getShareLink should construct valid Discord message URL (G33)', () => {
        const service = new GiveawayService();
        const link = service.getShareLink({
            guildId: 'guild_123',
            channelId: 'chan_456',
            messageId: 'msg_789'
        });

        expect(link).toBe('https://discord.com/channels/guild_123/chan_456/msg_789');
    });

    it('enter should reject user if requiredRoleId or allowedRoleIds is missing (G32)', async () => {
        const service = new GiveawayService();
        const fakeRepo = {
            findGiveawayById: async () => ({
                id: 'gw_1',
                status: 'active',
                endsAt: Date.now() + 3600000,
                requiredRoleId: 'role_subscriber',
                allowedRoleIds: ['role_subscriber', 'role_vip']
            }),
            addEntry: async () => true,
            listEntries: async () => []
        };
        service.setRepo(fakeRepo);

        // Sans le rôle
        const resFail = await service.enter('gw_1', 'user_no_role', ['role_other']);
        expect(resFail.ok).toBe(false);
        expect(resFail.reason).toBe('role_required');

        // Avec le rôle
        const resOk = await service.enter('gw_1', 'user_sub', ['role_subscriber']);
        expect(resOk.ok).toBe(true);
    });

    it('draw should pick winners and handle role multipliers (G32)', async () => {
        const service = new GiveawayService();
        const fakeRepo = {
            findGiveawayById: async () => ({
                id: 'gw_weighted',
                winnersCount: 1,
                roleMultipliers: {
                    'role_vip': 5
                }
            }),
            listEntries: async () => [
                { user_id: 'user_regular_1' },
                { user_id: 'user_regular_2' },
                { user_id: 'user_vip' }
            ]
        };
        service.setRepo(fakeRepo);

        const memberRolesMap = {
            'user_regular_1': [],
            'user_regular_2': [],
            'user_vip': ['role_vip']
        };

        const { winners, pool } = await service.draw('gw_weighted', memberRolesMap);
        expect(pool).toBe(3);
        expect(winners.length).toBe(1);
        expect(['user_regular_1', 'user_regular_2', 'user_vip']).toContain(winners[0]);
    });
});
