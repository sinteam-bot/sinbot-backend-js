/**
 * tests/role-color.test.js
 *
 * Tests unitaires pour la validation et l'application des couleurs de rôles (Phase 9 G25).
 */

import { describe, it, expect } from 'vitest';
import { parseHexColor, RoleColorCommands } from '../src/modules/community_reaction-roles/commands/role-color.cmd.js';

describe('Feature G25: Role Color Tests', () => {
    it('parseHexColor should normalize valid hex codes and reject invalid ones', () => {
        expect(parseHexColor('#ff0000')).toBe('#FF0000');
        expect(parseHexColor('5865F2')).toBe('#5865F2');
        expect(parseHexColor('#fff')).toBe('#FFFFFF');
        expect(parseHexColor('000')).toBe('#000000');

        expect(parseHexColor('not_a_color')).toBeNull();
        expect(parseHexColor('#12345')).toBeNull();
        expect(parseHexColor('#1234567')).toBeNull();
        expect(parseHexColor('')).toBeNull();
    });

    it('should set color on valid role', async () => {
        const cmd = new RoleColorCommands();

        let appliedColor = null;
        const mockRole = {
            id: 'role_123',
            name: 'VIP',
            position: 10,
            setColor: async (hex) => { appliedColor = hex; }
        };

        const replies = [];
        const interaction = {
            user: { tag: 'Admin#0001' },
            member: {
                permissions: {
                    has: () => true
                }
            },
            guild: {
                members: {
                    me: {
                        roles: {
                            highest: { position: 50 }
                        }
                    }
                }
            },
            options: {
                getRole: () => mockRole,
                getString: () => '#00FF00'
            },
            reply: async (payload) => {
                replies.push(payload);
            }
        };

        await cmd.executeRoleColor(interaction);

        expect(appliedColor).toBe('#00FF00');
        expect(replies.length).toBe(1);
        expect(replies[0].embeds).toBeDefined();
    });
});
