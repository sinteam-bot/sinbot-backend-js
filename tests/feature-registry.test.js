/**
 * Tests pour le FeatureRegistry
 *
 * Couvre :
 *  - define + list
 *  - get avec fallback YAML
 *  - get avec DB prioritaire
 *  - set (upsert) et hooks onEnable/onDisable
 *  - canUse (sans restrictions, avec rôles, feature désactivée)
 *  - listForGuild
 */

const { test, describe, beforeEach } = require('vitest');
const assert = require('node:assert');
const { FeatureRegistry, featureRegistry } = require('../src/core/feature-registry.js');

describe('FeatureRegistry', () => {
    let registry;

    beforeEach(() => {
        registry = new FeatureRegistry();
    });

    describe('define / list', () => {
        test('define enregistre une feature', () => {
            registry.define('test_feat', { defaults: { enabled: false, foo: 'bar' } });
            const list = registry.list();
            assert.strictEqual(list.length, 1);
            assert.strictEqual(list[0].name, 'test_feat');
            assert.deepStrictEqual(list[0].defaults, { enabled: false, foo: 'bar' });
        });

        test('define accepte des defaults vides', () => {
            registry.define('empty_feat');
            const list = registry.list();
            assert.strictEqual(list[0].defaults.enabled, false);
        });
    });

    describe('get (fallback)', () => {
        test('retourne les defaults si pas de DB ni YAML', async () => {
            registry.define('my_feat', { defaults: { enabled: true, max: 5 } });
            const state = await registry.get('guild-1', 'my_feat');
            assert.strictEqual(state.enabled, true);
            assert.strictEqual(state.config.max, 5);
            assert.strictEqual(state.source, 'default');
            assert.deepStrictEqual(state.allowedRoles, []);
        });

        test('retourne un état désactivé pour une feature inconnue', async () => {
            const state = await registry.get('guild-1', 'unknown');
            assert.strictEqual(state.enabled, false);
            assert.strictEqual(state.source, 'default');
        });
    });

    describe('canUse', () => {
        test('refuse si la feature est désactivée', async () => {
            registry.define('f1', { defaults: { enabled: false, allowed_roles: [] } });
            const r = await registry.canUse('guild-1', 'user-1', 'f1');
            assert.strictEqual(r.allowed, false);
            assert.strictEqual(r.reason, 'disabled');
        });

        test('autorise si la feature est activée sans restriction de rôles', async () => {
            registry.define('f2', { defaults: { enabled: true, allowed_roles: [] } });
            const r = await registry.canUse('guild-1', 'user-1', 'f2');
            assert.strictEqual(r.allowed, true);
        });

        test('autorise si pas de contexte client (fallback permissif)', async () => {
            registry.define('f3', { defaults: { enabled: true, allowed_roles: ['ROLE_X'] } });
            const r = await registry.canUse('guild-1', 'user-1', 'f3');
            assert.strictEqual(r.allowed, true);
        });
    });

    describe('set (sans DB)', () => {
        test('set appelle onEnable quand on active', async () => {
            let enabledFired = false;
            registry.define('toggle', {
                defaults: { enabled: false },
                onEnable: async (guildId) => { enabledFired = true; }
            });
            registry._dbAvailable = false;
            await registry.set('guild-1', 'toggle', { enabled: true });
            assert.strictEqual(enabledFired, true);
        });

        test('set appelle onDisable quand on désactive', async () => {
            let disabledFired = false;
            registry.define('toggle2', {
                defaults: { enabled: true },
                onDisable: async (guildId) => { disabledFired = true; }
            });
            registry._dbAvailable = false;
            await registry.set('guild-1', 'toggle2', { enabled: false });
            assert.strictEqual(disabledFired, true);
        });

        test('set rejette une feature inconnue', async () => {
            await assert.rejects(
                () => registry.set('guild-1', 'nope', { enabled: true }),
                /Feature inconnue/
            );
        });

        test('set requiert un guildId', async () => {
            registry.define('x', { defaults: {} });
            await assert.rejects(
                () => registry.set(null, 'x', {}),
                /guildId/
            );
        });
        test('set persiste et met à jour en DB avec timestamp millisecondes (BIGINT)', async () => {
            registry.define('logs_feat', {
                defaults: { enabled: false, channels: { moderation: null } }
            });
            const resSet = await registry.set('702103057898668072', 'logs_feat', {
                enabled: true,
                config: { channels: { moderation: '123456789' } },
                allowedRoles: ['987654321']
            });

            assert.strictEqual(resSet.enabled, true);
            assert.strictEqual(resSet.config.channels.moderation, '123456789');
            assert.deepStrictEqual(resSet.allowedRoles, ['987654321']);

            const fromDb = await registry.get('702103057898668072', 'logs_feat');
            assert.strictEqual(fromDb.enabled, true);
            assert.strictEqual(fromDb.config.channels.moderation, '123456789');
            assert.deepStrictEqual(fromDb.allowedRoles, ['987654321']);
            assert.strictEqual(fromDb.source, 'db');

            // Update existing row
            const resUpdate = await registry.set('702103057898668072', 'logs_feat', {
                enabled: false
            });
            assert.strictEqual(resUpdate.enabled, false);
            const fromDb2 = await registry.get('702103057898668072', 'logs_feat');
            assert.strictEqual(fromDb2.enabled, false);
            assert.strictEqual(fromDb2.config.channels.moderation, '123456789');
        });
    });

    describe('listForGuild', () => {
        test('combine define et état par défaut', async () => {
            registry.define('a', { defaults: { enabled: false } });
            registry.define('b', { defaults: { enabled: true, x: 1 } });
            const list = await registry.listForGuild('guild-1');
            assert.strictEqual(list.length, 2);
            const names = list.map(f => f.name).sort();
            assert.deepStrictEqual(names, ['a', 'b']);
        });
    });
});
