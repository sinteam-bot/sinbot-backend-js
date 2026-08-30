/**
 * tests/server-stats-service.test.js
 *
 * Tests unitaires et d'intégration pour ServerStatsService (Phase 9 G08).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { ServerStatsRepository } from '../src/modules/util_server_stats/services/server-stats.repository.js';
import { ServerStatsService } from '../src/modules/util_server_stats/services/server-stats.service.js';

describe('Feature G08: Server Stats Channel Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_stats_123';
    const channelId = 'chan_stats_456';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "server_stats_channels" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "channel_id" text NOT NULL,
                "stat_type" text NOT NULL,
                "format" text NOT NULL,
                "created_at" bigint NOT NULL,
                "updated_at" bigint NOT NULL,
                CONSTRAINT "server_stats_guild_channel_unique" UNIQUE("guild_id","channel_id")
            );
        `);
    });

    beforeEach(async () => {
        repo = new ServerStatsRepository();
        service = new ServerStatsService(repo);
        await db.pool.query(`DELETE FROM server_stats_channels WHERE guild_id = $1`, [guildId]);
    });

    it('should register and format channel names correctly', async () => {
        const registered = await service.registerChannel({
            guildId,
            channelId,
            statType: 'total_members',
            format: '👥 Membres : {count}'
        });

        expect(registered.guildId).toBe(guildId);
        expect(registered.channelId).toBe(channelId);
        expect(registered.statType).toBe('total_members');

        const mockGuild = {
            id: guildId,
            memberCount: 154,
            members: { cache: new Map() }
        };

        const formattedName = service.formatChannelName(mockGuild, 'total_members', registered.format);
        expect(formattedName).toBe('👥 Membres : 154');
    });

    it('should update channel name in updateGuildStats', async () => {
        await service.registerChannel({
            guildId,
            channelId,
            statType: 'bot_members',
            format: '🤖 Bots : {count}'
        });

        let newNameSet = null;
        const mockGuild = {
            id: guildId,
            memberCount: 50,
            members: {
                cache: new Map([
                    ['bot_1', { user: { bot: true } }],
                    ['bot_2', { user: { bot: true } }],
                    ['user_1', { user: { bot: false } }]
                ])
            },
            channels: {
                cache: new Map([
                    [channelId, {
                        id: channelId,
                        name: '🤖 Bots : 0',
                        setName: async (name) => { newNameSet = name; }
                    }]
                ])
            }
        };

        await service.updateGuildStats(mockGuild);

        expect(newNameSet).toBe('🤖 Bots : 2');
    });
});
