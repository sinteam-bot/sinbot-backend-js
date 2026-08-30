/**
 * tests/command-tag-parser.test.js
 *
 * Tests unitaires pour le parser de tags et d'actions (Phase 8 G44, G19, G43).
 */

import { describe, it, expect } from 'vitest';
import { parseCommandTags } from '../src/utils/commandTagParser.js';

describe('Feature G44, G19, G43: Command Tag Parser Tests', () => {
    it('should replace positional arguments and apply defaults {1:defaut}', async () => {
        const template = 'Bonjour {1:inconnu}, ton code est {2:0000} !';
        
        // Sans args
        const res1 = await parseCommandTags(template, { args: [] });
        expect(res1.text).toBe('Bonjour inconnu, ton code est 0000 !');

        // Avec 1 arg
        const res2 = await parseCommandTags(template, { args: ['Alice'] });
        expect(res2.text).toBe('Bonjour Alice, ton code est 0000 !');

        // Avec 2 args
        const res3 = await parseCommandTags(template, { args: ['Bob', '1234'] });
        expect(res3.text).toBe('Bonjour Bob, ton code est 1234 !');
    });

    it('should replace {args} and {args:defaut}', async () => {
        const template = 'Message: {args:aucun message}';
        const resEmpty = await parseCommandTags(template, { args: [] });
        expect(resEmpty.text).toBe('Message: aucun message');

        const resWithArgs = await parseCommandTags(template, { args: ['hello', 'world', '!'] });
        expect(resWithArgs.text).toBe('Message: hello world !');
    });

    it('should replace user, guild, and channel variables', async () => {
        const template = '{user.name} ({user.id}) sur {server.name} dans {channel.mention} !';
        const context = {
            user: { username: 'JohnDoe', id: '123456789' },
            guild: { name: 'Super Guilde', id: '987654321', memberCount: 42 },
            channel: { name: 'general', id: '111222333' }
        };

        const res = await parseCommandTags(template, context);
        expect(res.text).toBe('JohnDoe (123456789) sur Super Guilde dans <#111222333> !');
    });

    it('should replace XP and Economy variables (G19)', async () => {
        const template = 'Niveau {user.level} (XP: {user.xp}) | Portefeuille: {user.coins} coins';
        const context = {
            level: 25,
            xp: 15400,
            coins: 350
        };

        const res = await parseCommandTags(template, context);
        expect(res.text).toBe('Niveau 25 (XP: 15400) | Portefeuille: 350 coins');
    });

    it('should detect and execute {add-role:...} and {remove-role:...} and {delete} (G43)', async () => {
        const template = '{add-role:111122223333444455}{remove-role:999988887777666655}{delete}Rôles mis à jour pour {user} !';
        
        const addedRoles = [];
        const removedRoles = [];
        let deleted = false;

        const context = {
            user: { username: 'Alice', id: '100' },
            member: {
                id: '100',
                displayName: 'Alice',
                roles: {
                    add: async (roleId) => { addedRoles.push(roleId); },
                    remove: async (roleId) => { removedRoles.push(roleId); }
                }
            },
            message: {
                id: 'msg_1',
                delete: async () => { deleted = true; }
            }
        };

        const res = await parseCommandTags(template, context, { executeActions: true });
        
        expect(res.text).toBe('Rôles mis à jour pour Alice !');
        expect(res.actions.length).toBe(3);
        expect(addedRoles).toEqual(['111122223333444455']);
        expect(removedRoles).toEqual(['999988887777666655']);
        expect(deleted).toBe(true);
    });
});
