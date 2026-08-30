/**
 * tests/autoban-service.test.js
 *
 * Tests unitaires et d'intégration pour AutobanService (Phase 11 G17).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { AutobanRepository } from '../src/modules/security_autoban/services/autoban.repository.js';
import { AutobanService } from '../src/modules/security_autoban/services/autoban.service.js';

describe('Feature G17: Autoban Module Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_autoban_123';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "autoban_logs" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "user_id" text NOT NULL,
                "user_tag" text,
                "reason" text NOT NULL,
                "action" text NOT NULL,
                "created_at" bigint NOT NULL
            );
        `);
    });

    beforeEach(async () => {
        repo = new AutobanRepository();
        service = new AutobanService(repo);
        await db.pool.query(`DELETE FROM autoban_logs WHERE guild_id = $1`, [guildId]);
    });

    it('should detect and ban account created too recently', async () => {
        let bannedUser = null;
        const mockMember = {
            id: 'u_recent',
            guild: {
                id: guildId,
                name: 'Test Guild',
                members: {
                    ban: async (uid) => { bannedUser = uid; }
                }
            },
            user: {
                id: 'u_recent',
                tag: 'Recent#0001',
                createdTimestamp: Date.now() - (2 * 3600 * 1000), // Créé il y a 2h
                avatar: 'avatar_hash'
            }
        };

        const config = {
            enabled: true,
            min_account_age_hours: 24,
            action: 'ban'
        };

        const res = await service.processNewMember(mockMember, config);
        expect(res.acted).toBe(true);
        expect(res.action).toBe('ban');
        expect(res.reason).toContain('Compte trop récent');
        expect(bannedUser).toBe('u_recent');

        const logs = await service.listLogs(guildId);
        expect(logs.length).toBe(1);
        expect(logs[0].userId).toBe('u_recent');
    });

    it('should detect suspicious username matching regex', async () => {
        let kickedUser = null;
        const mockMember = {
            id: 'u_scam',
            guild: {
                id: guildId,
                name: 'Test Guild'
            },
            user: {
                id: 'u_scam',
                tag: 'Free_Discord_Nitro#0001',
                username: 'Free_Discord_Nitro',
                createdTimestamp: Date.now() - (50 * 3600 * 1000),
                avatar: 'avatar_hash'
            },
            kick: async (reason) => { kickedUser = reason; }
        };

        const config = {
            enabled: true,
            min_account_age_hours: 0,
            username_blacklist_regex: ['.*discord.*nitro.*'],
            action: 'kick'
        };

        const res = await service.processNewMember(mockMember, config);
        expect(res.acted).toBe(true);
        expect(res.action).toBe('kick');
        expect(kickedUser).toContain('[Autoban]');
    });

    it('should ignore safe members', async () => {
        const mockMember = {
            id: 'u_safe',
            guild: { id: guildId, name: 'Test Guild' },
            user: {
                id: 'u_safe',
                tag: 'NormalUser#0001',
                username: 'NormalUser',
                createdTimestamp: Date.now() - (100 * 3600 * 1000),
                avatar: 'avatar_hash'
            }
        };

        const config = {
            enabled: true,
            min_account_age_hours: 24,
            block_default_avatar: true,
            username_blacklist_regex: ['.*scam.*']
        };

        const res = await service.processNewMember(mockMember, config);
        expect(res.acted).toBe(false);
    });
});
