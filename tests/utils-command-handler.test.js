const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadCommands, executeCommand, checkCommandPermissions } = require('../src/utils/commandHandler.js');

describe('Command Handler Utilities Tests', () => {
    test('loadCommands: should load all command files from src/commands', () => {
        const commands = loadCommands({});
        assert.ok(commands instanceof Map);
        assert.ok(commands.size > 0);
        // Verify key commands exist
        assert.ok(commands.has('config') || commands.has('choose_member') || commands.has('confirm_member'));
    });

    test('checkCommandPermissions: allows admin users by default', () => {
        const fakeAdminContext = {
            member: {
                permissions: {
                    has: (flag) => true
                }
            },
            user: { id: 'admin_123' },
            channelId: 'channel_123'
        };

        const result = checkCommandPermissions(fakeAdminContext, 'ping');
        assert.strictEqual(result.allowed, true);
    });

    test('executeCommand: returns false for unknown command', async () => {
        const commands = new Map();
        const fakeMessage = {
            reply: async () => {}
        };

        const executed = await executeCommand('non_existing_cmd', fakeMessage, [], commands);
        assert.strictEqual(executed, false);
    });

    test('executeCommand: executes known command successfully', async () => {
        let called = false;
        const commands = new Map();
        commands.set('testcmd', {
            execute: async (msg, args) => {
                called = true;
            }
        });

        const fakeMessage = {
            member: {
                permissions: {
                    has: () => true
                }
            },
            user: { id: 'test_user' },
            channelId: 'chan_1',
            reply: async () => {}
        };

        const executed = await executeCommand('testcmd', fakeMessage, [], commands);
        assert.strictEqual(executed, true);
        assert.strictEqual(called, true);
    });
});
