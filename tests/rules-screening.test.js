/**
 * tests/rules-screening.test.js
 *
 * Tests unitaires pour RulesScreeningListener (Phase 10 G42).
 */

import { describe, it, expect } from 'vitest';
import { RulesScreeningListener } from '../src/modules/welcome_welcome/events/rules-screening.listener.js';

describe('Feature G42: Rules Screening Member Update Tests', () => {
    it('should grant role when pending transitions from true to false', async () => {
        const listener = new RulesScreeningListener();
        listener.getConfig = () => ({
            rules_accepted_roles: ['role_verified_member']
        });

        const addedRoles = [];

        const oldMember = {
            id: 'u1',
            pending: true,
            user: { tag: 'User#0001', bot: false },
            guild: { name: 'Test Guild', id: 'g1' }
        };

        const newMember = {
            id: 'u1',
            pending: false,
            user: { tag: 'User#0001', bot: false },
            guild: { name: 'Test Guild', id: 'g1' },
            roles: {
                cache: new Map(),
                add: async (rid) => { addedRoles.push(rid); }
            }
        };

        await listener.handle(oldMember, newMember);

        expect(addedRoles).toEqual(['role_verified_member']);
    });

    it('should ignore if pending did not change', async () => {
        const listener = new RulesScreeningListener();
        listener.getConfig = () => ({
            rules_accepted_roles: ['role_verified_member']
        });

        const addedRoles = [];

        const oldMember = {
            id: 'u1',
            pending: false,
            user: { tag: 'User#0001', bot: false },
            guild: { name: 'Test Guild', id: 'g1' }
        };

        const newMember = {
            id: 'u1',
            pending: false,
            user: { tag: 'User#0001', bot: false },
            guild: { name: 'Test Guild', id: 'g1' },
            roles: {
                cache: new Map(),
                add: async (rid) => { addedRoles.push(rid); }
            }
        };

        await listener.handle(oldMember, newMember);

        expect(addedRoles.length).toBe(0);
    });
});
