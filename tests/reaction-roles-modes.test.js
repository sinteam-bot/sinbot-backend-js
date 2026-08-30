/**
 * tests/reaction-roles-modes.test.js
 *
 * Tests unitaires pour les modes de réaction rôles avancés (Phase 10 G18).
 */

import { describe, it, expect, vi } from 'vitest';
import { ReactionListener } from '../src/modules/community_reaction-roles/events/reaction-listener.js';

describe('Feature G18: Advanced Reaction Roles Modes (reversed, binding, temporary)', () => {
    function makeListener(mode) {
        const service = {
            findForReaction: async () => ({
                id: 'rr_1',
                roleId: 'role_test_123',
                mode
            })
        };
        const listener = new ReactionListener(service);
        listener._ensureEnabled = async () => ({ self_assignable: true });
        return listener;
    }

    it('mode reversed: removes role on reactionAdd, gives role on reactionRemove', async () => {
        const listener = makeListener('reversed');

        const added = [];
        const removed = [];

        const mockMember = {
            roles: {
                cache: new Map([['role_test_123', { id: 'role_test_123' }]]),
                add: async (r) => { added.push(r); },
                remove: async (r) => { removed.push(r); }
            }
        };

        const reaction = {
            emoji: '⭐',
            message: {
                id: 'msg_1',
                guild: {
                    id: 'g1',
                    members: { fetch: async () => mockMember }
                }
            }
        };

        // Add reaction -> should remove role
        await listener.onReactionAdd(reaction, { id: 'u1', bot: false });
        expect(removed).toEqual(['role_test_123']);

        // Remove reaction -> should add role
        mockMember.roles.cache.delete('role_test_123');
        await listener.onReactionRemove(reaction, { id: 'u1', bot: false });
        expect(added).toEqual(['role_test_123']);
    });

    it('mode binding: adds role on reactionAdd, does NOT remove on reactionRemove', async () => {
        const listener = makeListener('binding');

        const added = [];
        const removed = [];

        const mockMember = {
            roles: {
                cache: new Map(),
                add: async (r) => { added.push(r); },
                remove: async (r) => { removed.push(r); }
            }
        };

        const reaction = {
            emoji: '⭐',
            message: {
                id: 'msg_1',
                guild: {
                    id: 'g1',
                    members: { fetch: async () => mockMember }
                }
            }
        };

        // Add reaction -> should add role
        await listener.onReactionAdd(reaction, { id: 'u1', bot: false });
        expect(added).toEqual(['role_test_123']);

        // Remove reaction -> should NOT remove role
        mockMember.roles.cache.set('role_test_123', { id: 'role_test_123' });
        await listener.onReactionRemove(reaction, { id: 'u1', bot: false });
        expect(removed.length).toBe(0);
    });
});
