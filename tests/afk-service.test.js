/**
 * tests/afk-service.test.js
 *
 * Tests unitaires et d'intégration pour AfkService (Phase 9 G06).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { AfkRepository } from '../src/modules/util_afk/services/afk.repository.js';
import { AfkService } from '../src/modules/util_afk/services/afk.service.js';
import { AfkMessageListener } from '../src/modules/util_afk/events/afk-message.listener.js';

describe('Feature G06: AFK Service & Listener Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_afk_123';
    const userId = 'usr_afk_456';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "afk_users" (
                "guild_id" text NOT NULL,
                "user_id" text NOT NULL,
                "reason" text,
                "afk_since" bigint NOT NULL,
                CONSTRAINT "afk_users_guild_user_pk" PRIMARY KEY("guild_id","user_id")
            );
        `);
    });

    beforeEach(async () => {
        repo = new AfkRepository();
        service = new AfkService(repo);
        await db.pool.query(`DELETE FROM afk_users WHERE guild_id = $1`, [guildId]);
    });

    it('should set AFK and clear AFK on message', async () => {
        const afk = await service.setAfk(guildId, userId, 'En pause café ☕');
        expect(afk.guildId).toBe(guildId);
        expect(afk.userId).toBe(userId);
        expect(afk.reason).toBe('En pause café ☕');
        expect(afk.afkSince).toBeGreaterThan(0);

        // Get AFK
        const check = await service.getAfk(guildId, userId);
        expect(check).not.toBeNull();
        expect(check.reason).toBe('En pause café ☕');

        // Clear AFK
        const cleared = await service.clearAfk(guildId, userId);
        expect(cleared).not.toBeNull();

        const after = await service.getAfk(guildId, userId);
        expect(after).toBeNull();
    });

    it('listener should notify when mentioned user is AFK', async () => {
        await service.setAfk(guildId, 'target_user_789', 'Occuper');

        const listener = new AfkMessageListener(service);
        // Mock _isEnabled
        listener._isEnabled = async () => true;

        const replies = [];
        const message = {
            guild: { id: guildId },
            author: { id: 'speaker_1', bot: false },
            mentions: {
                users: new Map([
                    ['target_user_789', { id: 'target_user_789', username: 'TargetUser', bot: false }]
                ])
            },
            reply: async (payload) => {
                replies.push(payload);
            }
        };

        await listener.handle(message);

        expect(replies.length).toBe(1);
        expect(replies[0].content).toContain('TargetUser');
        expect(replies[0].content).toContain('Occuper');
    });
});
