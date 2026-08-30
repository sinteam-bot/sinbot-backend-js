/**
 * tests/statcounters-statroles.test.js
 *
 * Tests unitaires et d'intégration pour les salons compteurs et statroles (Module P5 - Statbot).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { ServerStatsRepository } from '../src/modules/util_server_stats/services/server-stats.repository.js';
import { ServerStatsService } from '../src/modules/util_server_stats/services/server-stats.service.js';

describe('Specialized Bot Feature P5: Statbot Channel Counters & Statroles', () => {
    let repo;
    let service;
    const guildId = 'test_guild_stats_123';

    beforeAll(async () => {
        try {
            await db.pool.query(`ALTER TABLE "server_stats_channels" ADD COLUMN IF NOT EXISTS "target_id" text;`);
        } catch (_) {}

        try {
            await db.pool.query(`ALTER TABLE "server_stats_channels" ADD COLUMN IF NOT EXISTS "timezone" text;`);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "server_stats_channels" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "channel_id" text NOT NULL,
                    "stat_type" text NOT NULL,
                    "format" text NOT NULL,
                    "target_id" text,
                    "timezone" text,
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint NOT NULL,
                    CONSTRAINT "server_stats_guild_channel_unique" UNIQUE("guild_id","channel_id")
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "statroles" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "role_id" text NOT NULL,
                    "type" text NOT NULL,
                    "threshold" integer NOT NULL,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "statroles_guild_role_type_unique" UNIQUE("guild_id","role_id","type")
                );
            `);
        } catch (_) {}
    });

    beforeEach(async () => {
        repo = new ServerStatsRepository();
        service = new ServerStatsService(repo);

        await db.pool.query(`DELETE FROM statroles WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM server_stats_channels WHERE guild_id = $1`, [guildId]);
    });

    it('should accurately compute and format all counter types', () => {
        const mockGuild = {
            id: guildId,
            memberCount: 150,
            premiumSubscriptionCount: 7,
            members: {
                cache: new Map([
                    ['u1', { user: { bot: false }, presence: { status: 'online' } }],
                    ['u2', { user: { bot: false }, presence: { status: 'dnd' } }],
                    ['b1', { user: { bot: true }, presence: { status: 'offline' } }]
                ])
            },
            roles: {
                cache: new Map([
                    ['role_vip', { id: 'role_vip', name: 'VIP', members: { size: 18 } }]
                ])
            },
            channels: {
                cache: new Map([['c1', {}], ['c2', {}], ['c3', {}]])
            }
        };

        expect(service.computeStatCount(mockGuild, 'total_members')).toBe(150);
        expect(service.computeStatCount(mockGuild, 'bot_members')).toBe(1);
        expect(service.computeStatCount(mockGuild, 'human_members')).toBe(149);
        expect(service.computeStatCount(mockGuild, 'boost_count')).toBe(7);
        expect(service.computeStatCount(mockGuild, 'role_members', 'role_vip')).toBe(18);
        expect(service.computeStatCount(mockGuild, 'channel_count')).toBe(3);

        const totalFormatted = service.formatChannelName(mockGuild, 'total_members', '👥 Membres : {count}');
        expect(totalFormatted).toBe('👥 Membres : 150');

        const roleFormatted = service.formatChannelName(mockGuild, 'role_members', '👑 {role} : {count}', 'role_vip');
        expect(roleFormatted).toBe('👑 VIP : 18');

        const clockFormatted = service.formatChannelName(mockGuild, 'clock', '🕒 {tz} : {time}', null, 'Europe/Paris');
        expect(clockFormatted).toContain('Paris');
        expect(clockFormatted).toMatch(/\d{2}:\d{2}/);
    });

    it('setupDefaultCounters should create a Category and 4 voice channels', async () => {
        let categoryCreated = null;
        let createdChannels = [];

        const mockGuild = {
            id: guildId,
            memberCount: 100,
            premiumSubscriptionCount: 3,
            members: { cache: new Map() },
            channels: {
                create: async (payload) => {
                    if (payload.type === 4) { // GuildCategory
                        categoryCreated = { id: 'cat_stats_999', ...payload };
                        return categoryCreated;
                    }
                    const chan = { id: `chan_${createdChannels.length + 1}`, ...payload };
                    createdChannels.push(chan);
                    return chan;
                }
            }
        };

        const res = await service.setupDefaultCounters(mockGuild);

        expect(res.categoryId).toBe('cat_stats_999');
        expect(res.channels.length).toBe(4);
        expect(createdChannels.length).toBe(4);

        const inDb = await repo.listChannels(guildId);
        expect(inDb.length).toBe(4);
    });

    it('should manage and evaluate Statroles based on user activity', async () => {
        await service.addStatrole({
            guildId,
            roleId: 'role_veteran_100',
            type: 'messages',
            threshold: 100
        });

        await service.addStatrole({
            guildId,
            roleId: 'role_vocal_500',
            type: 'voice_minutes',
            threshold: 500
        });

        const list = await service.listStatroles(guildId);
        expect(list.length).toBe(2);

        let addedRoles = [];
        const mockMember = {
            guild: { id: guildId },
            roles: {
                cache: new Map(),
                add: async (roleId) => { addedRoles.push(roleId); }
            }
        };

        // Membre avec 150 messages et 200 min de vocal
        const assigned = await service.checkMemberStatroles(mockMember, {
            messages: 150,
            voice_minutes: 200
        });

        expect(assigned).toEqual(['role_veteran_100']);
        expect(addedRoles).toContain('role_veteran_100');

        await service.deleteStatrole(guildId, 'role_veteran_100');
        const after = await service.listStatroles(guildId);
        expect(after.length).toBe(1);
    });
});
