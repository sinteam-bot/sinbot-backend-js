/**
 * tests/custom-commands-advanced.test.js
 *
 * Tests d'intégration pour les Custom Commands avancées avec tags, rôles requis et variables.
 */

import { describe, it, expect } from 'vitest';
import { CustomCommandsMessageListener } from '../src/modules/util_custom_commands/events/message-create.listener.js';

describe('Feature G43, G44, G19: Custom Commands Advanced Execution', () => {
    it('should parse variables and execute actions in _fireCustomCommand', async () => {
        const listener = new CustomCommandsMessageListener(null);

        const sentMessages = [];
        const addedRoles = [];
        const removedRoles = [];
        let deletedMessage = false;

        const cmd = {
            id: 'cc_1',
            name: 'rankup',
            responseText: '{add-role:111122223333444455}{remove-role:999988887777666655}{delete}Félicitations {user.name} ! Tu es niveau {user.level} et ton tag est {1:Novice}.',
            responseEmbedJson: null
        };

        const message = {
            id: 'msg_999',
            author: { id: 'usr_1', username: 'Maxime' },
            guild: { id: 'g_1', name: 'GuildMax' },
            channel: {
                id: 'chan_1',
                send: async (payload) => {
                    sentMessages.push(payload);
                }
            },
            member: {
                id: 'usr_1',
                displayName: 'Maxime',
                roles: {
                    add: async (rid) => { addedRoles.push(rid); },
                    remove: async (rid) => { removedRoles.push(rid); }
                }
            },
            delete: async () => {
                deletedMessage = true;
            }
        };

        await listener._fireCustomCommand(cmd, message, ['Expert']);

        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].content).toBe('Félicitations Maxime ! Tu es niveau 1 et ton tag est Expert.');
        expect(addedRoles).toEqual(['111122223333444455']);
        expect(removedRoles).toEqual(['999988887777666655']);
        expect(deletedMessage).toBe(true);
    });
});
