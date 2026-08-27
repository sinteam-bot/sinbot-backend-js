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

    test('ModuleManager: should register and bind module commands properly', () => {
        const { ModuleManager } = require('../src/core/module-manager.js');
        const { Container } = require('../src/core/container.js');
        const { DiscordEventBus } = require('../src/core/event-bus.js');
        const { Module, Command } = require('../src/core/decorators.js');

        class TestCommand {
            async ping(interaction) {
                return 'pong';
            }
        }
        Command({ name: 'ping', description: 'Test ping command' })(TestCommand.prototype, 'ping');

        class TestModule {}
        Module({
            commands: [TestCommand]
        })(TestModule);

        const testContainer = new Container();
        const testBus = new DiscordEventBus();
        const manager = new ModuleManager(testContainer, testBus);

        const fakeClient = { commands: new Map() };
        manager.init(fakeClient);
        manager.registerModule(TestModule);

        assert.ok(fakeClient.commands.has('ping'));
        const registered = fakeClient.commands.get('ping');
        assert.strictEqual(registered.name, 'ping');
        assert.strictEqual(registered.description, 'Test ping command');
        assert.ok(registered.data);
    });

    test('syncDiscordSlashCommands: correctly serializes and syncs commands payload', async () => {
        const { syncDiscordSlashCommands } = require('../src/utils/commandDeployer.js');
        const { SlashCommandBuilder } = require('discord.js');

        const fakeCommands = new Map();
        fakeCommands.set('help', {
            data: new SlashCommandBuilder().setName('help').setDescription('Afficher aide'),
            module: 'Core'
        });
        fakeCommands.set('rank', {
            data: new SlashCommandBuilder().setName('rank').setDescription('Afficher niveau XP'),
            module: 'XP'
        });

        let putRouteCalled = null;
        let putBodyCalled = null;

        const mockRest = {
            put: async (route, { body }) => {
                putRouteCalled = route;
                putBodyCalled = body;
                return body;
            }
        };

        // Mock client Discord
        const fakeClient = {
            token: 'mock_token_123',
            user: { id: 'mock_bot_user_id' },
            guilds: {
                cache: new Map([
                    ['123456789', { id: '123456789', name: 'Test Guild' }]
                ])
            },
            commands: fakeCommands
        };

        // We can test the sync with guildId and mock REST
        const result = await syncDiscordSlashCommands(fakeClient, {
            guildId: '123456789',
            rest: mockRest
        });

        assert.ok(result);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.count, 2);
        assert.ok(result.commands.includes('help'));
        assert.ok(result.commands.includes('rank'));
        assert.ok(putRouteCalled.includes('123456789'));
        assert.strictEqual(putBodyCalled.length, 2);
    });
});

