const assert = require('node:assert');

vi.mock('../db/legacy-bridge.js', () => ({
    legacy: {
        archiveDiscordEvent: vi.fn().mockResolvedValue(undefined),
        upsertDiscordChannel: vi.fn().mockResolvedValue(undefined),
        upsertDiscordRole: vi.fn().mockResolvedValue(undefined),
        upsertDiscordEmoji: vi.fn().mockResolvedValue(undefined),
        upsertDiscordUser: vi.fn().mockResolvedValue(undefined),
        upsertDiscordMember: vi.fn().mockResolvedValue(undefined),
        softDeleteChannel: vi.fn().mockResolvedValue(undefined),
        softDeleteRole: vi.fn().mockResolvedValue(undefined),
        softDeleteEmoji: vi.fn().mockResolvedValue(undefined),
    }
}));

vi.mock('./logger.js', () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('./dateUtils.js', () => ({
    toISOStringSafe: vi.fn(() => '2024-01-01T00:00:00.000Z'),
}));

const discordEventTracker = require('../src/utils/discordEventTracker.js');

describe('discordEventTracker', () => {
    let mockClient;
    let handlers;

    beforeEach(() => {
        handlers = {};
        mockClient = {
            on: vi.fn((event, handler) => {
                handlers[event] = handler;
            }),
        };
    });

    describe('initDiscordEventTracker', () => {
        test('registers event handlers on client', () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            assert.ok(mockClient.on.mock.calls.length > 0);
        });

        test('registers channelCreate handler', () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            assert.ok(typeof handlers.channelCreate === 'function');
        });

        test('registers channelDelete handler', () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            assert.ok(typeof handlers.channelDelete === 'function');
        });

        test('registers messageDelete handler', () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            assert.ok(typeof handlers.messageDelete === 'function');
        });

        test('registers roleCreate handler', () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            assert.ok(typeof handlers.roleCreate === 'function');
        });

        test('registers guildMemberRemove handler', () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            assert.ok(typeof handlers.guildMemberRemove === 'function');
        });

        test('registers userUpdate handler', () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            assert.ok(typeof handlers.userUpdate === 'function');
        });

        test('registers all expected events', () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            const expectedEvents = [
                'channelCreate',
                'channelDelete',
                'channelUpdate',
                'roleCreate',
                'roleDelete',
                'roleUpdate',
                'emojiCreate',
                'emojiDelete',
                'emojiUpdate',
                'messageDelete',
                'messageUpdate',
                'guildMemberRemove',
                'guildMemberUpdate',
                'userUpdate',
                'threadCreate',
                'threadDelete',
                'threadUpdate',
            ];
            for (const event of expectedEvents) {
                assert.ok(typeof handlers[event] === 'function', `Missing handler for ${event}`);
            }
        });

        test('channelCreate handler does not throw with valid data', async () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            const mockChannel = {
                id: 'ch123',
                name: 'test-channel',
                type: 0,
                guild: { id: 'guild123' },
                parentId: null,
            };
            await handlers.channelCreate(mockChannel);
        });

        test('roleCreate handler does not throw with valid data', async () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            const mockRole = {
                id: 'role123',
                name: 'Test Role',
                color: 0,
                guild: { id: 'guild123' },
            };
            await handlers.roleCreate(mockRole);
        });

        test('messageDelete handler does not throw with valid data', async () => {
            discordEventTracker.initDiscordEventTracker(mockClient);
            const mockMessage = {
                id: 'msg123',
                content: 'test message',
                guild: { id: 'guild123' },
                channel: { id: 'ch123' },
            };
            await handlers.messageDelete(mockMessage);
        });
    });
});
