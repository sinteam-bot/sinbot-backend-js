const assert = require('node:assert');

describe('decorators', () => {
    let decorators;

    beforeAll(() => {
        decorators = require('../src/core/decorators.js');
    });

    describe('Module', () => {
        test('sets __moduleMetadata on target', () => {
            class MyModule {}
            decorators.Module({ providers: ['Service'] })(MyModule);
            assert.ok(MyModule.__moduleMetadata);
            assert.deepStrictEqual(MyModule.__moduleMetadata.providers, ['Service']);
        });

        test('provides default empty arrays', () => {
            class MyModule {}
            decorators.Module({})(MyModule);
            const meta = MyModule.__moduleMetadata;
            assert.deepStrictEqual(meta.imports, []);
            assert.deepStrictEqual(meta.providers, []);
            assert.deepStrictEqual(meta.controllers, []);
            assert.deepStrictEqual(meta.events, []);
            assert.deepStrictEqual(meta.commands, []);
            assert.deepStrictEqual(meta.exports, []);
        });

        test('sets all metadata properties', () => {
            class MyModule {}
            decorators.Module({
                imports: ['SubModule'],
                providers: ['Service'],
                controllers: ['Ctrl'],
                events: ['Event'],
                commands: ['Cmd'],
                exports: ['Export'],
            })(MyModule);
            const meta = MyModule.__moduleMetadata;
            assert.deepStrictEqual(meta.imports, ['SubModule']);
            assert.deepStrictEqual(meta.providers, ['Service']);
            assert.deepStrictEqual(meta.controllers, ['Ctrl']);
            assert.deepStrictEqual(meta.events, ['Event']);
            assert.deepStrictEqual(meta.commands, ['Cmd']);
            assert.deepStrictEqual(meta.exports, ['Export']);
        });
    });

    describe('Injectable', () => {
        test('sets __isInjectable on target', () => {
            class MyService {}
            decorators.Injectable()(MyService);
            assert.strictEqual(MyService.__isInjectable, true);
        });
    });

    describe('Repository', () => {
        test('sets __isRepository on target', () => {
            class MyRepo {}
            decorators.Repository()(MyRepo);
            assert.strictEqual(MyRepo.__isRepository, true);
        });
    });

    describe('Controller', () => {
        test('sets __controllerPrefix with leading slash', () => {
            class MyController {}
            decorators.Controller('/api')(MyController);
            assert.strictEqual(MyController.__controllerPrefix, '/api');
        });

        test('adds leading slash if missing', () => {
            class MyController {}
            decorators.Controller('api')(MyController);
            assert.strictEqual(MyController.__controllerPrefix, '/api');
        });

        test('handles empty prefix', () => {
            class MyController {}
            decorators.Controller('')(MyController);
            assert.strictEqual(MyController.__controllerPrefix, '/');
        });
    });

    describe('route decorators', () => {
        test('Get adds route with get method', () => {
            class MyController {}
            decorators.Get('/test')(MyController.prototype, 'getTest');
            assert.ok(MyController.__routes);
            assert.strictEqual(MyController.__routes.length, 1);
            assert.strictEqual(MyController.__routes[0].method, 'get');
            assert.strictEqual(MyController.__routes[0].path, '/test');
            assert.strictEqual(MyController.__routes[0].handlerName, 'getTest');
        });

        test('Post adds route with post method', () => {
            class MyController {}
            decorators.Post('/create')(MyController.prototype, 'create');
            assert.strictEqual(MyController.__routes[0].method, 'post');
        });

        test('Put adds route with put method', () => {
            class MyController {}
            decorators.Put('/update')(MyController.prototype, 'update');
            assert.strictEqual(MyController.__routes[0].method, 'put');
        });

        test('Patch adds route with patch method', () => {
            class MyController {}
            decorators.Patch('/patch')(MyController.prototype, 'patch');
            assert.strictEqual(MyController.__routes[0].method, 'patch');
        });

        test('Delete adds route with delete method', () => {
            class MyController {}
            decorators.Delete('/remove')(MyController.prototype, 'remove');
            assert.strictEqual(MyController.__routes[0].method, 'delete');
        });

        test('adds leading slash to path if missing', () => {
            class MyController {}
            decorators.Get('test')(MyController.prototype, 'getTest');
            assert.strictEqual(MyController.__routes[0].path, '/test');
        });

        test('handles root path', () => {
            class MyController {}
            decorators.Get('/')(MyController.prototype, 'getRoot');
            assert.strictEqual(MyController.__routes[0].path, '');
        });

        test('adds multiple routes', () => {
            class MyController {}
            decorators.Get('/list')(MyController.prototype, 'list');
            decorators.Get('/detail')(MyController.prototype, 'detail');
            assert.strictEqual(MyController.__routes.length, 2);
        });

        test('works with static class reference', () => {
            class MyController {}
            decorators.Get('/static')(MyController, 'getStatic');
            assert.ok(MyController.__routes);
            assert.strictEqual(MyController.__routes[0].method, 'get');
        });
    });

    describe('OnEvent', () => {
        test('adds event handler metadata', () => {
            class MyHandler {}
            decorators.OnEvent('messageCreate')(MyHandler.prototype, 'onMessage');
            assert.ok(MyHandler.__eventHandlers);
            assert.strictEqual(MyHandler.__eventHandlers.length, 1);
            assert.strictEqual(MyHandler.__eventHandlers[0].eventName, 'messageCreate');
            assert.strictEqual(MyHandler.__eventHandlers[0].handlerName, 'onMessage');
        });

        test('adds options to event handler', () => {
            class MyHandler {}
            decorators.OnEvent('messageCreate', { channelId: '123' })(MyHandler.prototype, 'onMessage');
            assert.deepStrictEqual(MyHandler.__eventHandlers[0].options, { channelId: '123' });
        });

        test('adds multiple event handlers', () => {
            class MyHandler {}
            decorators.OnEvent('messageCreate')(MyHandler.prototype, 'onMessage');
            decorators.OnEvent('guildMemberAdd')(MyHandler.prototype, 'onMemberAdd');
            assert.strictEqual(MyHandler.__eventHandlers.length, 2);
        });

        test('works with static class reference', () => {
            class MyHandler {}
            decorators.OnEvent('ready')(MyHandler, 'onReady');
            assert.ok(MyHandler.__eventHandlers);
            assert.strictEqual(MyHandler.__eventHandlers[0].eventName, 'ready');
        });
    });

    describe('Command', () => {
        test('adds command metadata with options object', () => {
            class MyCommand {}
            decorators.Command({ name: 'ping', description: 'Ping' })(MyCommand.prototype, 'execute');
            assert.ok(MyCommand.__commands);
            assert.strictEqual(MyCommand.__commands.length, 1);
            assert.strictEqual(MyCommand.__commands[0].name, 'ping');
            assert.strictEqual(MyCommand.__commands[0].description, 'Ping');
            assert.strictEqual(MyCommand.__commands[0].handlerName, 'execute');
        });

        test('adds command metadata with string name', () => {
            class MyCommand {}
            decorators.Command('ping')(MyCommand.prototype, 'execute');
            assert.strictEqual(MyCommand.__commands[0].name, 'ping');
        });

        test('handles static class reference in Command', () => {
            class MyCommand {}
            decorators.Command({ name: 'static-cmd' })(MyCommand, 'execute');
            assert.ok(MyCommand.__commands);
            assert.strictEqual(MyCommand.__commands[0].name, 'static-cmd');
        });

        test('adds multiple commands', () => {
            class MyCommand {}
            decorators.Command({ name: 'ping' })(MyCommand.prototype, 'ping');
            decorators.Command({ name: 'pong' })(MyCommand.prototype, 'pong');
            assert.strictEqual(MyCommand.__commands.length, 2);
        });
    });

    describe('Cron', () => {
        test('adds cron task metadata', () => {
            class MyService {}
            decorators.Cron('0 9 * * *')(MyService.prototype, 'dailyTask');
            assert.ok(MyService.__cronTasks);
            assert.strictEqual(MyService.__cronTasks.length, 1);
            assert.strictEqual(MyService.__cronTasks[0].cronTime, '0 9 * * *');
            assert.strictEqual(MyService.__cronTasks[0].handlerName, 'dailyTask');
        });

        test('adds options to cron task', () => {
            class MyService {}
            decorators.Cron('0 9 * * *', { timezone: 'UTC', configKey: 'scheduler.daily' })(MyService.prototype, 'dailyTask');
            assert.deepStrictEqual(MyService.__cronTasks[0].options, { timezone: 'UTC', configKey: 'scheduler.daily' });
        });

        test('adds multiple cron tasks', () => {
            class MyService {}
            decorators.Cron('0 9 * * *')(MyService.prototype, 'dailyTask');
            decorators.Cron('0 21 * * *')(MyService.prototype, 'eveningTask');
            assert.strictEqual(MyService.__cronTasks.length, 2);
        });

        test('works with static class reference', () => {
            class MyService {}
            decorators.Cron('0 */6 * * *')(MyService, 'periodicTask');
            assert.ok(MyService.__cronTasks);
            assert.strictEqual(MyService.__cronTasks[0].cronTime, '0 */6 * * *');
        });
    });
});
