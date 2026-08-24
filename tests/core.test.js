const { test, describe } = require('node:test');
const assert = require('node:assert');
const { 
    Container, 
    DiscordEventBus, 
    ModuleManager, 
    Injectable, 
    Repository, 
    Controller, 
    Get, 
    Post, 
    OnEvent, 
    Command, 
    Module 
} = require('../src/core/index.js');

describe('Core Framework Tests', () => {

    describe('Container (IoC & DI)', () => {
        test('should register and resolve singleton instances', () => {
            const localContainer = new Container();
            class TestRepo {}
            Repository()(TestRepo);

            class TestService {
                static inject = [TestRepo];
                constructor(repo) {
                    this.repo = repo;
                }
            }
            Injectable()(TestService);

            const instance1 = localContainer.resolve(TestService);
            const instance2 = localContainer.resolve(TestService);

            assert.ok(instance1 instanceof TestService);
            assert.ok(instance1.repo instanceof TestRepo);
            assert.strictEqual(instance1, instance2, 'Should be a singleton');
        });

        test('should throw error on missing dependency', () => {
            const localContainer = new Container();
            class BadService {
                static inject = [null];
            }
            assert.throws(() => {
                localContainer.resolve(BadService);
            }, /Dépendance invalide/);
        });
    });

    describe('DiscordEventBus (PubSub with Filters & Single Listener)', () => {
        test('should register a Discord listener only once and dispatch to multiple handlers', async () => {
            const listeners = {};
            const mockClient = {
                on: (evt, fn) => {
                    listeners[evt] = listeners[evt] || [];
                    listeners[evt].push(fn);
                },
                once: (evt, fn) => {
                    listeners[evt] = listeners[evt] || [];
                    listeners[evt].push(fn);
                }
            };

            const bus = new DiscordEventBus();
            bus.init(mockClient);

            const results = [];
            bus.subscribe('messageCreate', async (msg) => {
                results.push(`handler1:${msg.content}`);
            }, { priority: 10 });

            bus.subscribe('messageCreate', async (msg) => {
                results.push(`handler2:${msg.content}`);
            }, { priority: 5 });

            assert.strictEqual(listeners['messageCreate'].length, 1, 'Only one client.on listener must exist');

            // Dispatch an event
            await bus.dispatch('messageCreate', { content: 'hello', author: { bot: false } });

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0], 'handler1:hello', 'Priority 10 should run before priority 5');
            assert.strictEqual(results[1], 'handler2:hello');
        });

        test('should filter out bot messages when ignoreBots is true', async () => {
            const bus = new DiscordEventBus();
            bus.init({ on: () => {}, once: () => {} });

            let called = false;
            bus.subscribe('messageCreate', async () => {
                called = true;
            }, { ignoreBots: true });

            await bus.dispatch('messageCreate', { author: { bot: true } });
            assert.strictEqual(called, false, 'Should ignore bot messages');
        });
    });

    describe('Decorators & ModuleManager', () => {
        test('should register routes and controllers properly', () => {
            class MockService {}
            Injectable()(MockService);

            class MockController {
                static inject = [MockService];
                constructor(s) { this.s = s; }
                async getTestData() { return { test: true }; }
            }
            Controller('/api/test')(MockController);
            Get('/data')(MockController.prototype, 'getTestData');

            class MockModule {}
            Module({
                providers: [MockService],
                controllers: [MockController]
            })(MockModule);

            const mockApp = { use: () => {} };
            const mgr = new ModuleManager(new Container(), new DiscordEventBus());
            mgr.init({ on: () => {}, once: () => {} }, mockApp);
            mgr.registerModule(MockModule);

            const resolvedCtrl = mgr.container.resolve(MockController);
            assert.ok(resolvedCtrl instanceof MockController);
            assert.ok(resolvedCtrl.s instanceof MockService);
        });
    });

});
