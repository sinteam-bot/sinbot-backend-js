/**
 * tests/ranks-service.test.js
 *
 * Tests unitaires et d'intégration pour RanksService (Phase 10 G26).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { RanksRepository } from '../src/modules/community_ranks/services/ranks.repository.js';
import { RanksService } from '../src/modules/community_ranks/services/ranks.service.js';

describe('Feature G26: Ranks Service & Commands Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_ranks_123';
    const roleId = 'role_gamer_456';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "ranks" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "role_id" text NOT NULL,
                "name" text NOT NULL,
                "description" text,
                "created_at" bigint NOT NULL,
                CONSTRAINT "ranks_guild_name_unique" UNIQUE("guild_id","name")
            );
        `);
    });

    beforeEach(async () => {
        repo = new RanksRepository();
        service = new RanksService(repo);
        await db.pool.query(`DELETE FROM ranks WHERE guild_id = $1`, [guildId]);
    });

    it('should create and list ranks', async () => {
        const res = await service.createRank({
            guildId,
            roleId,
            name: 'Gamer',
            description: 'Pour les passionnés de jeux vidéo'
        });

        expect(res.ok).toBe(true);
        expect(res.data.name).toBe('gamer');
        expect(res.data.roleId).toBe(roleId);

        const list = await service.listRanks(guildId);
        expect(list.length).toBe(1);
    });

    it('should allow member to join and leave ranks', async () => {
        await service.createRank({ guildId, roleId, name: 'Annonces' });

        const added = [];
        const removed = [];

        const mockMember = {
            id: 'u1',
            guild: { id: guildId },
            roles: {
                cache: new Map(),
                add: async (r) => { added.push(r); mockMember.roles.cache.set(r, { id: r }); },
                remove: async (r) => { removed.push(r); mockMember.roles.cache.delete(r); }
            }
        };

        // Join
        const joinRes = await service.joinRank(mockMember, 'annonces');
        expect(joinRes.ok).toBe(true);
        expect(added).toEqual([roleId]);

        // Join again -> already has role
        const joinAgain = await service.joinRank(mockMember, 'annonces');
        expect(joinAgain.ok).toBe(false);
        expect(joinAgain.error).toContain('déjà');

        // Leave
        const leaveRes = await service.leaveRank(mockMember, 'annonces');
        expect(leaveRes.ok).toBe(true);
        expect(removed).toEqual([roleId]);
    });
});
