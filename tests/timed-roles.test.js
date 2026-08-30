/**
 * tests/timed-roles.test.js
 *
 * Tests unitaires et d'intégration pour TimedRolesService (Phase 10 G07).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { TimedRolesRepository } from '../src/modules/community_timed_roles/services/timed-roles.repository.js';
import { TimedRolesService } from '../src/modules/community_timed_roles/services/timed-roles.service.js';

describe('Feature G07: Timed Roles Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_timed_123';
    const userId = 'usr_timed_456';
    const roleId = 'role_vip_789';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "timed_roles" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "user_id" text NOT NULL,
                "role_id" text NOT NULL,
                "expires_at" bigint NOT NULL,
                "created_at" bigint NOT NULL
            );
        `);
    });

    beforeEach(async () => {
        repo = new TimedRolesRepository();
        service = new TimedRolesService(repo);
        await db.pool.query(`DELETE FROM timed_roles WHERE guild_id = $1`, [guildId]);
    });

    it('parseDuration should correctly parse time units', () => {
        expect(service.parseDuration('30s')).toBe(30);
        expect(service.parseDuration('15m')).toBe(900);
        expect(service.parseDuration('2h')).toBe(7200);
        expect(service.parseDuration('3d')).toBe(259200);
        expect(service.parseDuration('1w')).toBe(604800);
        expect(service.parseDuration('invalid')).toBeNull();
    });

    it('addTimedRole should assign role and persist expiration', async () => {
        const added = [];
        const mockMember = {
            id: userId,
            guild: { id: guildId },
            roles: {
                add: async (r) => { added.push(r); }
            }
        };

        const res = await service.addTimedRole(mockMember, roleId, 3600);
        expect(res.ok).toBe(true);
        expect(res.data.userId).toBe(userId);
        expect(res.data.roleId).toBe(roleId);
        expect(res.data.expiresAt).toBeGreaterThan(Date.now());
        expect(added).toEqual([roleId]);

        const list = await service.listUserTimedRoles(guildId, userId);
        expect(list.length).toBe(1);
    });

    it('checkAndRemoveExpired should remove expired roles and cleanup DB', async () => {
        // Inserer un role expiré directement
        await repo.insertTimedRole({
            guildId,
            userId,
            roleId,
            expiresAt: Date.now() - 1000
        });

        const removed = [];
        const mockClient = {
            guilds: {
                cache: new Map([
                    [guildId, {
                        id: guildId,
                        name: 'Test Guild',
                        members: {
                            cache: new Map([
                                [userId, {
                                    id: userId,
                                    roles: {
                                        cache: new Map([[roleId, { id: roleId }]]),
                                        remove: async (r) => { removed.push(r); }
                                    }
                                }]
                            ])
                        }
                    }]
                ])
            }
        };

        await service.checkAndRemoveExpired(mockClient);

        expect(removed).toEqual([roleId]);

        const remaining = await service.listUserTimedRoles(guildId, userId);
        expect(remaining.length).toBe(0);
    });
});
