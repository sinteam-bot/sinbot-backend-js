const assert = require('node:assert');

vi.mock('express', () => {
    const mockRouter = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        use: vi.fn(),
    };
    const routerRef = mockRouter;
    return {
        Router: vi.fn(() => routerRef),
        default: { Router: vi.fn(() => routerRef) },
    };
});

vi.mock('node-cron', () => {
    const schedule = vi.fn(() => ({ stop: vi.fn() }));
    return {
        schedule,
        default: { schedule },
    };
});

vi.mock('../src/core/container.js', () => {
    class MockContainer {
        constructor() { this.services = new Map(); this.factories = new Map(); }
        register(token, instance) {
            const key = typeof token === 'string' ? token : token.name;
            if (instance) this.services.set(key, instance);
            else if (typeof token === 'function') this.factories.set(key, token);
        }
        resolve(token) {
            const key = typeof token === 'string' ? token : token.name;
            if (this.services.has(key)) return this.services.get(key);
            if (this.factories.has(key)) {
                const Factory = this.factories.get(key);
                const instance = new Factory();
                this.services.set(key, instance);
                return instance;
            }
            if (typeof token === 'function') {
                this.factories.set(key, token);
                return this.resolve(token);
            }
            throw new Error(`Cannot resolve ${key}`);
        }
        has(token) {
            const key = typeof token === 'string' ? token : token.name;
            return this.services.has(key) || this.factories.has(key);
        }
    }
    return { Container: MockContainer, container: new MockContainer() };
});

vi.mock('../src/core/event-bus.js', () => {
    class MockEventBus {
        constructor() { this.subscriptions = new Map(); }
        init() {}
        subscribe(eventName, handler, options, context) {
            if (!this.subscriptions.has(eventName)) this.subscriptions.set(eventName, []);
            this.subscriptions.get(eventName).push({ handler, options, context });
        }
    }
    return { DiscordEventBus: MockEventBus, eventBus: new MockEventBus() };
});

vi.mock('../src/config/index.js', () => ({
    config: { scheduler: { enabled: true, timezone: 'Europe/Paris' } },
    getConfig: () => ({ scheduler: { enabled: true, timezone: 'Europe/Paris' } }),
}));

const { ModuleManager } = require('../src/core/module-manager.js');

describe('ModuleManager', () => {
    let manager;
    let mockContainer;
    let mockEventBus;

    beforeEach(() => {
        const { Container } = require('../src/core/container.js');
        const { DiscordEventBus } = require('../src/core/event-bus.js');
        mockContainer = new Container();
        mockEventBus = new DiscordEventBus();
        manager = new ModuleManager(mockContainer, mockEventBus);
    });

    describe('constructor', () => {
        test('initializes with empty modules', () => {
            assert.strictEqual(manager.modules.length, 0);
        });

        test('initializes with empty commands', () => {
            assert.ok(manager.commands instanceof Map);
            assert.strictEqual(manager.commands.size, 0);
        });

        test('creates express router', () => {
            assert.ok(manager.apiRouter);
            assert.ok(typeof manager.apiRouter.get === 'function');
        });
    });

    describe('init', () => {
        test('sets discord client', () => {
            const client = { commands: new Map() };
            manager.init(client);
            assert.strictEqual(manager.discordClient, client);
        });

        test('initializes eventBus with client', () => {
            const client = { commands: new Map() };
            manager.init(client);
        });

        test('creates commands map on client if missing', () => {
            const client = {};
            manager.init(client);
            assert.ok(client.commands instanceof Map);
        });

        test('transfers registered commands to client', () => {
            const mockCmd = { name: 'test' };
            manager.commands.set('test', mockCmd);
            const client = { commands: new Map() };
            manager.init(client);
            assert.ok(client.commands.has('test'));
        });
    });

    describe('registerModule', () => {
        test('loads a module with metadata', () => {
            class TestModule {
                static __moduleMetadata = { providers: [] };
            }
            manager.registerModule(TestModule);
            assert.ok(manager.modules.length > 0);
        });
    });

    describe('registerModules', () => {
        test('loads multiple modules', () => {
            class Module1 {
                static __moduleMetadata = {};
            }
            class Module2 {
                static __moduleMetadata = {};
            }
            manager.registerModules([Module1, Module2]);
            assert.strictEqual(manager.modules.length, 2);
        });

        test('accepts single module', () => {
            class TestModule {
                static __moduleMetadata = {};
            }
            manager.registerModules(TestModule);
            assert.strictEqual(manager.modules.length, 1);
        });
    });

    describe('_loadModule', () => {
        test('registers module in container', () => {
            class TestModule {
                static __moduleMetadata = {};
            }
            manager._loadModule(TestModule);
            assert.ok(mockContainer.has(TestModule));
        });

        test('loads providers', () => {
            class Provider {
                static __moduleMetadata = {};
            }
            class TestModule {
                static __moduleMetadata = { providers: [Provider] };
            }
            manager._loadModule(TestModule);
            assert.ok(mockContainer.has(Provider));
        });

        test('loads controllers', () => {
            class Controller {
                static __moduleMetadata = {};
                static __controllerPrefix = '/api';
                static __routes = [{ method: 'get', path: '/test', handlerName: 'test' }];
                async test() { return { success: true }; }
            }
            class TestModule {
                static __moduleMetadata = { controllers: [Controller] };
            }
            manager._loadModule(TestModule);
        });

        test('loads events', () => {
            class EventHandler {
                static __moduleMetadata = {};
                static __eventHandlers = [{ eventName: 'messageCreate', handlerName: 'onMessage' }];
                async onMessage() {}
            }
            class TestModule {
                static __moduleMetadata = { events: [EventHandler] };
            }
            manager._loadModule(TestModule);
            assert.ok(mockEventBus.subscriptions.has('messageCreate'));
        });

        test('loads commands', () => {
            class CommandHandler {
                static __moduleMetadata = {};
                static __commands = [{ name: 'ping', description: 'Ping command', handlerName: 'execute' }];
                async execute() { return 'pong'; }
            }
            class TestModule {
                static __moduleMetadata = { commands: [CommandHandler] };
            }
            manager._loadModule(TestModule);
            assert.ok(manager.commands.has('ping'));
        });

        test('loads imports first', () => {
            const loaded = [];
            class SubModule {
                static __moduleMetadata = {};
                constructor() { loaded.push('SubModule'); }
            }
            class TestModule {
                static __moduleMetadata = { imports: [SubModule] };
                constructor() { loaded.push('TestModule'); }
            }
            manager._loadModule(TestModule);
            const subIdx = loaded.indexOf('SubModule');
            const testIdx = loaded.indexOf('TestModule');
            assert.ok(subIdx < testIdx);
        });
    });

    describe('_mountController', () => {
        test('mounts express routes', () => {
            class Controller {
                static __controllerPrefix = '/api';
                static __routes = [
                    { method: 'get', path: '/test', handlerName: 'getTest' },
                    { method: 'post', path: '/create', handlerName: 'create' },
                ];
                async getTest() { return { data: 'test' }; }
                async create() { return { created: true }; }
            }

            const controllerInstance = new Controller();
            manager._mountController(Controller, controllerInstance);

            const router = manager.apiRouter;
            assert.ok(router.get);
            assert.ok(router.post);
        });
    });

    describe('_bindCommands', () => {
        test('registers command in manager', () => {
            class CommandHandler {
                static __commands = [{ name: 'ping', description: 'Ping', handlerName: 'execute' }];
                async execute() { return 'pong'; }
            }
            const instance = new CommandHandler();
            manager._bindCommands(CommandHandler, instance, 'TestModule');
            assert.ok(manager.commands.has('ping'));
        });

        test('registers command on discord client', () => {
            const client = { commands: new Map() };
            manager.init(client);

            class CommandHandler {
                static __commands = [{ name: 'ping', description: 'Ping', handlerName: 'execute' }];
                async execute() { return 'pong'; }
            }
            const instance = new CommandHandler();
            manager._bindCommands(CommandHandler, instance, 'TestModule');
            assert.ok(client.commands.has('ping'));
        });

        test('skips SlashCommandBuilder for button commands', () => {
            class CommandHandler {
                static __commands = [{ name: 'test-button', description: 'Button', handlerName: 'handle' }];
                async handle() {}
            }
            const instance = new CommandHandler();
            manager._bindCommands(CommandHandler, instance, 'TestModule');
            const cmd = manager.commands.get('test-button');
            assert.ok(cmd);
            assert.strictEqual(cmd.data, null);
        });
    });

    describe('_bindCronTasks', () => {
        test('schedules cron jobs', () => {
            class Service {
                static __cronTasks = [{ cronTime: '0 9 * * *', handlerName: 'dailyTask' }];
                async dailyTask() {}
            }
            const instance = new Service();
            manager._bindCronTasks(Service, instance);
            assert.strictEqual(manager.cronJobs.length, 1);
            assert.strictEqual(manager.cronJobs[0].className, 'Service');
            assert.strictEqual(manager.cronJobs[0].cronTime, '0 9 * * *');
        });

        test('skips when no cron tasks', () => {
            class Service {
                static __cronTasks = [];
            }
            const instance = new Service();
            manager._bindCronTasks(Service, instance);
            assert.strictEqual(manager.cronJobs.length, 0);
        });
    });

    describe('getRouter', () => {
        test('returns the express router', () => {
            const router = manager.getRouter();
            assert.ok(router);
            assert.ok(typeof router.get === 'function');
        });
    });

    describe('stopCronJobs', () => {
        test('stops all cron jobs', () => {
            const cron = require('node-cron');
            class Service {
                static __cronTasks = [{ cronTime: '0 9 * * *', handlerName: 'dailyTask' }];
                async dailyTask() {}
            }
            const instance = new Service();
            manager._bindCronTasks(Service, instance);
            assert.strictEqual(manager.cronJobs.length, 1);
            manager.stopCronJobs();
            assert.strictEqual(manager.cronJobs.length, 0);
        });
    });
});
