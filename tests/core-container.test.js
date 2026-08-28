const assert = require('node:assert');

const { Container, container } = require('../src/core/container.js');

describe('Container', () => {
    let c;

    beforeEach(() => {
        c = new Container();
    });

    describe('register', () => {
        test('registers a class factory', () => {
            class MyService {}
            c.register(MyService);
            assert.ok(c.has(MyService));
        });

        test('registers a named instance', () => {
            const instance = { name: 'test' };
            c.register('myService', instance);
            assert.ok(c.has('myService'));
            assert.strictEqual(c.resolve('myService'), instance);
        });

        test('throws on null token', () => {
            assert.throws(() => c.register(null), /Dépendance invalide/);
        });

        test('uses class name as key when registering class', () => {
            class MyService {}
            c.register(MyService);
            assert.ok(c.has('MyService'));
        });
    });

    describe('resolve', () => {
        test('resolves a registered class as singleton', () => {
            class MyService { constructor() { this.id = Math.random(); } }
            c.register(MyService);
            const a = c.resolve(MyService);
            const b = c.resolve(MyService);
            assert.strictEqual(a, b);
        });

        test('resolves a named instance', () => {
            const instance = { name: 'test' };
            c.register('myService', instance);
            assert.strictEqual(c.resolve('myService'), instance);
        });

        test('throws on null token', () => {
            assert.throws(() => c.resolve(null), /Dépendance invalide/);
        });

        test('throws on unresolvable token', () => {
            assert.throws(() => c.resolve('nonExistent'), /Impossible de résoudre/);
        });

        test('auto-registers and resolves unregistered class', () => {
            class MyService { constructor() { this.value = 42; } }
            const instance = c.resolve(MyService);
            assert.ok(instance);
            assert.strictEqual(instance.value, 42);
        });

        test('resolves dependencies via inject', () => {
            class Dep { constructor() { this.name = 'dep'; } }
            class Service {
                static inject = [Dep];
                constructor(dep) { this.dep = dep; }
            }
            c.register(Dep);
            c.register(Service);
            const instance = c.resolve(Service);
            assert.ok(instance.dep);
            assert.strictEqual(instance.dep.name, 'dep');
        });

        test('resolves dependencies via dependencies', () => {
            class Dep { constructor() { this.name = 'dep2'; } }
            class Service {
                static dependencies = [Dep];
                constructor(dep) { this.dep = dep; }
            }
            c.register(Dep);
            c.register(Service);
            const instance = c.resolve(Service);
            assert.ok(instance.dep);
            assert.strictEqual(instance.dep.name, 'dep2');
        });
    });

    describe('has', () => {
        test('returns true for registered class', () => {
            class MyService {}
            c.register(MyService);
            assert.strictEqual(c.has(MyService), true);
        });

        test('returns true for registered instance', () => {
            c.register('myService', {});
            assert.strictEqual(c.has('myService'), true);
        });

        test('returns false for unregistered token', () => {
            assert.strictEqual(c.has('nonExistent'), false);
        });

        test('returns false for null token', () => {
            assert.strictEqual(c.has(null), false);
        });
    });

    describe('clear', () => {
        test('removes all registered services and factories', () => {
            class MyService {}
            c.register(MyService);
            c.register('instance', {});
            c.clear();
            assert.strictEqual(c.has(MyService), false);
            assert.strictEqual(c.has('instance'), false);
        });
    });
});

describe('default container', () => {
    test('is an instance of Container', () => {
        assert.ok(container instanceof Container);
    });
});
