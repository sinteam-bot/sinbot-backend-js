const assert = require('node:assert');

vi.mock('discord.js', () => {
    const mockPut = vi.fn().mockResolvedValue(undefined);
    return {
        REST: vi.fn(() => ({
            put: mockPut,
            setToken: vi.fn().mockReturnThis(),
        })),
        Routes: {
            applicationGuildCommands: vi.fn((clientId, guildId) => `/apps/${clientId}/guilds/${guildId}/commands`),
            applicationCommands: vi.fn((clientId) => `/apps/${clientId}/commands`),
        },
        SlashCommandBuilder: vi.fn(),
    };
});

vi.mock('../config/index.js', () => ({
    getConfig: () => ({
        discord: {
            commands: { enabled: true },
            token: 'mock-token',
            client_id: 'mock-client-id',
            guild_id: 'mock-guild-id',
        },
    }),
    config: {
        discord: {
            commands: { enabled: true },
            token: 'mock-token',
            client_id: 'mock-client-id',
            guild_id: 'mock-guild-id',
        },
    },
}));

const commandDeployer = require('../src/utils/commandDeployer.js');

describe('commandDeployer', () => {
    let mockPut;

    beforeEach(() => {
        const { REST } = require('discord.js');
        REST.mockClear();
        mockPut = REST.mock.results[0]?.value?.put || (() => {});
        if (mockPut.mockClear) mockPut.mockClear();
    });

    describe('syncDiscordSlashCommands', () => {
        test('returns success with empty commands when no commands registered', async () => {
            const client = { user: { id: 'client123' }, commands: new Map() };
            const result = await commandDeployer.syncDiscordSlashCommands(client);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.count, 0);
        });

        test('deploys commands successfully with valid data', async () => {
            const { REST } = require('discord.js');
            const mockCmdData = {
                name: 'test-command',
                description: 'A test command',
                toJSON: function() { return { name: this.name, description: this.description }; },
            };

            const client = {
                user: { id: '123456789' },
                commands: new Map([['test-command', { data: mockCmdData, module: 'TestModule' }]]),
                guilds: { cache: new Map() },
            };

            const result = await commandDeployer.syncDiscordSlashCommands(client);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.count, 1);
            assert.ok(result.commands.includes('test-command'));

            const restInstance = REST.mock.results[0].value;
            assert.ok(restInstance.put.mock.calls.length > 0);
        });

        test('filters out invalid command names', async () => {
            const invalidCmd = {
                name: 'INVALID NAME WITH SPACES',
                description: 'Invalid',
                toJSON: function() { return { name: this.name, description: this.description }; },
            };

            const client = {
                user: { id: '123456789' },
                commands: new Map([['invalid', { data: invalidCmd }]]),
                guilds: { cache: new Map() },
            };

            const result = await commandDeployer.syncDiscordSlashCommands(client);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.count, 0);
        });

        test('handles duplicate command names (case insensitive)', async () => {
            const cmd1 = {
                name: 'Test-Cmd',
                description: 'First',
                toJSON: function() { return { name: this.name, description: this.description }; },
            };
            const cmd2 = {
                name: 'test-cmd',
                description: 'Duplicate',
                toJSON: function() { return { name: this.name, description: this.description }; },
            };

            const client = {
                user: { id: '123456789' },
                commands: new Map([
                    ['test-cmd', { data: cmd1 }],
                    ['test-cmd-2', { data: cmd2 }],
                ]),
                guilds: { cache: new Map() },
            };

            const result = await commandDeployer.syncDiscordSlashCommands(client);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.count, 1);
        });

        test('handles commands without toJSON method', async () => {
            const cmdData = { name: 'simple-cmd', description: 'Simple command' };

            const client = {
                user: { id: '123456789' },
                commands: new Map([['simple', { data: cmdData }]]),
                guilds: { cache: new Map() },
            };

            const result = await commandDeployer.syncDiscordSlashCommands(client);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.count, 1);
        });

        test('returns error when REST call fails', async () => {
            const { REST } = require('discord.js');
            REST.mockImplementation(() => ({
                put: vi.fn().mockRejectedValue(new Error('Discord API Error')),
                setToken: vi.fn().mockReturnThis(),
            }));

            const cmd = {
                name: 'test-cmd',
                description: 'Test',
                toJSON: function() { return { name: this.name, description: this.description }; },
            };

            const client = {
                user: { id: '123456789' },
                commands: new Map([['test-cmd', { data: cmd }]]),
                guilds: { cache: new Map() },
            };

            const result = await commandDeployer.syncDiscordSlashCommands(client);
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.error, 'Discord API Error');
        });

        test('uses guild from client.guilds.cache when available', async () => {
            const { REST, Routes } = require('discord.js');
            const cmd = {
                name: 'guild-cmd',
                description: 'Guild command',
                toJSON: function() { return { name: this.name, description: this.description }; },
            };

            const mockGuild = { id: 'guild123', name: 'Test Guild' };
            const client = {
                user: { id: '123456789' },
                commands: new Map([['guild-cmd', { data: cmd }]]),
                guilds: { cache: new Map([['guild123', mockGuild]]) },
            };

            const result = await commandDeployer.syncDiscordSlashCommands(client, { guildId: 'guild123' });

            assert.strictEqual(result.success, true);
            assert.ok(Routes.applicationGuildCommands.mock.calls.length > 0);
        });
    });
});
