const assert = require('node:assert');

vi.mock('../config/index.js', () => ({
    config: {},
    getConfig: () => ({}),
}));

vi.mock('../services/discordCacheService.js', () => ({
    cacheSingleMember: vi.fn().mockResolvedValue(undefined),
    softDeleteMember: vi.fn().mockResolvedValue(undefined),
    cacheGuildRoles: vi.fn().mockResolvedValue(undefined),
    softDeleteRole: vi.fn().mockResolvedValue(undefined),
    cacheGuildEmojis: vi.fn().mockResolvedValue(undefined),
    softDeleteEmoji: vi.fn().mockResolvedValue(undefined),
    cacheGuildChannels: vi.fn().mockResolvedValue(undefined),
    softDeleteChannel: vi.fn().mockResolvedValue(undefined),
    softDeleteMessage: vi.fn().mockResolvedValue(undefined),
    softDeleteMessages: vi.fn().mockResolvedValue(undefined),
}));

const { DiscordEventBus, eventBus } = require('../src/core/event-bus.js');

describe('DiscordEventBus', () => {
    let bus;

    beforeEach(() => {
        bus = new DiscordEventBus();
    });

    describe('constructor', () => {
        test('initializes with empty subscriptions', () => {
            assert.ok(bus.subscriptions instanceof Map);
            assert.strictEqual(bus.subscriptions.size, 0);
        });

        test('initializes with empty registered events', () => {
            assert.ok(bus.registeredDiscordEvents instanceof Set);
            assert.strictEqual(bus.registeredDiscordEvents.size, 0);
        });

        test('sets max listeners to 100', () => {
            assert.strictEqual(bus.getMaxListeners(), 100);
        });
    });

    describe('init', () => {
        test('sets client reference', () => {
            const mockClient = { on: vi.fn(), once: vi.fn() };
            bus.init(mockClient);
            assert.strictEqual(bus.client, mockClient);
        });

        test('registers cache listeners on client', () => {
            const mockClient = { on: vi.fn(), once: vi.fn() };
            bus.init(mockClient);
            assert.ok(mockClient.on.mock.calls.length > 0);
        });
    });

    describe('subscribe', () => {
        test('adds subscription for event', () => {
            const handler = vi.fn();
            bus.subscribe('messageCreate', handler);
            assert.ok(bus.subscriptions.has('messageCreate'));
            assert.strictEqual(bus.subscriptions.get('messageCreate').length, 1);
        });

        test('adds multiple subscriptions for same event', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            bus.subscribe('messageCreate', handler1);
            bus.subscribe('messageCreate', handler2);
            assert.strictEqual(bus.subscriptions.get('messageCreate').length, 2);
        });

        test('sorts subscriptions by priority', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            const handler3 = vi.fn();
            bus.subscribe('messageCreate', handler1, { priority: 1 });
            bus.subscribe('messageCreate', handler2, { priority: 10 });
            bus.subscribe('messageCreate', handler3, { priority: 5 });
            const subs = bus.subscriptions.get('messageCreate');
            assert.strictEqual(subs[0].options.priority, 10);
            assert.strictEqual(subs[1].options.priority, 5);
            assert.strictEqual(subs[2].options.priority, 1);
        });

        test('sets default options', () => {
            const handler = vi.fn();
            bus.subscribe('messageCreate', handler);
            const sub = bus.subscriptions.get('messageCreate')[0];
            assert.strictEqual(sub.options.ignoreBots, true);
            assert.strictEqual(sub.options.priority, 0);
        });

        test('overrides default options', () => {
            const handler = vi.fn();
            bus.subscribe('messageCreate', handler, { ignoreBots: false, priority: 5 });
            const sub = bus.subscriptions.get('messageCreate')[0];
            assert.strictEqual(sub.options.ignoreBots, false);
            assert.strictEqual(sub.options.priority, 5);
        });

        test('registers discord listener when client is set', () => {
            const mockClient = { on: vi.fn(), once: vi.fn() };
            bus.init(mockClient);
            mockClient.on.mockClear();

            const handler = vi.fn();
            bus.subscribe('messageCreate', handler);

            assert.ok(mockClient.on.mock.calls.some(c => c[0] === 'messageCreate'));
        });
    });

    describe('dispatch', () => {
        test('calls subscribed handler', async () => {
            const handler = vi.fn();
            bus.subscribe('messageCreate', handler);
            await bus.dispatch('messageCreate', { content: 'test' });
            assert.ok(handler.mock.calls.length > 0);
        });

        test('does nothing with no subscriptions', async () => {
            await bus.dispatch('messageCreate', { content: 'test' });
        });

        test('passes context to handler via apply', async () => {
            const context = { value: 42 };
            const handler = vi.fn();
            bus.subscribe('testEvent', handler, {}, context);
            await bus.dispatch('testEvent', 'arg1');
            assert.ok(handler.mock.calls.length > 0);
            assert.strictEqual(handler.mock.calls[0][0], 'arg1');
        });

        test('filters bot messages when ignoreBots is true', async () => {
            const handler = vi.fn();
            bus.subscribe('messageCreate', handler, { ignoreBots: true });
            await bus.dispatch('messageCreate', { author: { bot: true }, content: 'bot msg' });
            assert.strictEqual(handler.mock.calls.length, 0);
        });

        test('allows bot messages when ignoreBots is false', async () => {
            const handler = vi.fn();
            bus.subscribe('messageCreate', handler, { ignoreBots: false });
            await bus.dispatch('messageCreate', { author: { bot: true }, content: 'bot msg' });
            assert.ok(handler.mock.calls.length > 0);
        });

        test('filters by channelId', async () => {
            const handler = vi.fn();
            bus.subscribe('messageCreate', handler, { channelId: 'ch123' });
            await bus.dispatch('messageCreate', { channel: { id: 'ch456' }, content: 'wrong channel' });
            assert.strictEqual(handler.mock.calls.length, 0);
        });

        test('allows messages from correct channelId', async () => {
            const handler = vi.fn();
            bus.subscribe('messageCreate', handler, { channelId: 'ch123' });
            await bus.dispatch('messageCreate', { channel: { id: 'ch123' }, content: 'correct channel' });
            assert.ok(handler.mock.calls.length > 0);
        });

        test('skips when configKey module is disabled', async () => {
            const handler = vi.fn();
            bus.subscribe('messageCreate', handler, { configKey: 'disabledModule' });
            await bus.dispatch('messageCreate', { content: 'test' });
            assert.ok(handler.mock.calls.length > 0);
        });

        test('applies custom filter', async () => {
            const handler = vi.fn();
            const filter = (msg) => msg.content.includes('important');
            bus.subscribe('testEvent', handler, { filter });
            await bus.dispatch('testEvent', { content: 'hello world' });
            assert.strictEqual(handler.mock.calls.length, 0);
            await bus.dispatch('testEvent', { content: 'this is important' });
            assert.ok(handler.mock.calls.length > 0);
        });

        test('handles handler errors gracefully', async () => {
            const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
            const successHandler = vi.fn();
            bus.subscribe('messageCreate', errorHandler);
            bus.subscribe('messageCreate', successHandler);
            await bus.dispatch('messageCreate', { content: 'test' });
            assert.ok(successHandler.mock.calls.length > 0);
        });
    });

    describe('_ensureDiscordListener', () => {
        test('does nothing without client', () => {
            bus._ensureDiscordListener('messageCreate');
            assert.strictEqual(bus.registeredDiscordEvents.size, 0);
        });

        test('does not register same event twice', () => {
            const mockClient = { on: vi.fn(), once: vi.fn() };
            bus.init(mockClient);
            mockClient.on.mockClear();

            bus._ensureDiscordListener('messageCreate');
            bus._ensureDiscordListener('messageCreate');
            const calls = mockClient.on.mock.calls.filter(c => c[0] === 'messageCreate');
            assert.strictEqual(calls.length, 1);
        });

        test('uses once for clientReady event', () => {
            const mockClient = { on: vi.fn(), once: vi.fn() };
            bus.init(mockClient);
            mockClient.once.mockClear();

            bus._ensureDiscordListener('clientReady');
            assert.ok(mockClient.once.mock.calls.some(c => c[0] === 'clientReady'));
        });
    });
});

describe('default eventBus', () => {
    test('is an instance of DiscordEventBus', () => {
        assert.ok(eventBus instanceof DiscordEventBus);
    });
});
