/**
 * Tests pour le FeatureRegistry (Phase 6 du plan migrate-to-c12)
 *
 * Couvre :
 *  - define + list
 *  - get avec fallback c12 (cascade example → default → guild)
 *  - set (écriture fichier) et hooks onEnable/onDisable
 *  - canUse (sans restrictions, avec rôles, feature désactivée)
 *  - listForGuild
 *
 * Le test redirige DATA_DIR vers un répertoire tmp pour isoler les écritures.
 */

const assert = require('node:assert');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { FeatureRegistry } = require('../src/core/feature-registry.js');

const TEST_DATA_DIR = path.join(os.tmpdir(), `feature-registry-test-${Date.now()}`);

async function setupDataDir() {
    await fsp.rm(TEST_DATA_DIR, { recursive: true, force: true });
    await fsp.mkdir(path.join(TEST_DATA_DIR, 'example'), { recursive: true });
    await fsp.mkdir(path.join(TEST_DATA_DIR, 'default'), { recursive: true });
}

function patchDataDir() {
    const c12 = require('../src/config/c12-loader.js');
    c12.DATA_DIR = TEST_DATA_DIR;
    c12.EXAMPLE_DIR = path.join(TEST_DATA_DIR, 'example');
    c12.DEFAULT_DIR = path.join(TEST_DATA_DIR, 'default');
    // Vider le cache interne
    if (c12._featureCache) c12._featureCache.clear();
}

function makeRegistry() {
    const c12 = require('../src/config/c12-loader.js');
    if (c12._featureCache) c12._featureCache.clear();
    return new FeatureRegistry();
}

describe('FeatureRegistry (Phase 6 : c12 file backend)', () => {
    beforeEach(async () => {
        await setupDataDir();
        patchDataDir();
    });

    afterEach(async () => {
        await fsp.rm(TEST_DATA_DIR, { recursive: true, force: true });
    });

    describe('define / list', () => {
        test('define enregistre une feature', () => {
            const reg = makeRegistry();
            reg.define('test_feat', { defaults: { enabled: false, foo: 'bar' } });
            const list = reg.list();
            assert.strictEqual(list.length, 1);
            assert.strictEqual(list[0].name, 'test_feat');
            assert.deepStrictEqual(list[0].defaults, { enabled: false, foo: 'bar' });
        });

        test('define accepte des defaults vides', () => {
            const reg = makeRegistry();
            reg.define('empty_feat');
            const list = reg.list();
            assert.strictEqual(list[0].defaults.enabled, false);
        });
    });

    describe('get (c12 cascade)', () => {
        test('retourne les defaults si aucun fichier YAML n\'existe', async () => {
            const reg = makeRegistry();
            reg.define('my_feat', { defaults: { enabled: true, max: 5 } });
            const state = await reg.get('guild-1', 'my_feat');
            assert.strictEqual(state.enabled, true);
            assert.strictEqual(state.config.max, 5);
            assert.strictEqual(state.source, 'file');
            assert.deepStrictEqual(state.allowedRoles, []);
        });

        test('retourne un état désactivé pour une feature inconnue', async () => {
            const reg = makeRegistry();
            const state = await reg.get('guild-1', 'unknown');
            assert.strictEqual(state.enabled, false);
            assert.strictEqual(state.source, 'default');
        });

        test('cascade example → default → guild', async () => {
            // Écrire example/default/guild
            await fsp.writeFile(
                path.join(TEST_DATA_DIR, 'example', 'feat.config.yml'),
                'enabled: false\nextra: "from-example"\n',
                'utf8'
            );
            await fsp.writeFile(
                path.join(TEST_DATA_DIR, 'default', 'feat.config.yml'),
                'enabled: true\n',
                'utf8'
            );
            await fsp.mkdir(path.join(TEST_DATA_DIR, '999'), { recursive: true });
            await fsp.writeFile(
                path.join(TEST_DATA_DIR, '999', 'feat.config.yml'),
                'extra: "from-guild"\n',
                'utf8'
            );

            const reg = makeRegistry();
            reg.define('feat', { defaults: { enabled: false, extra: 'default-code' } });
            const state = await reg.get('999', 'feat');
            assert.strictEqual(state.enabled, true); // default écrase example
            assert.strictEqual(state.config.extra, 'from-guild'); // guild écrase default
        });
    });

    describe('set (écriture fichier)', () => {
        test('set appelle onEnable quand on active', async () => {
            const reg = makeRegistry();
            let enabledFired = false;
            reg.define('toggle', {
                defaults: { enabled: false },
                onEnable: async () => { enabledFired = true; }
            });
            await reg.set('guild-1', 'toggle', { enabled: true });
            assert.strictEqual(enabledFired, true);
        });

        test('set appelle onDisable quand on désactive', async () => {
            const reg = makeRegistry();
            let disabledFired = false;
            reg.define('toggle2', {
                defaults: { enabled: true },
                onDisable: async () => { disabledFired = true; }
            });
            await reg.set('guild-1', 'toggle2', { enabled: false });
            assert.strictEqual(disabledFired, true);
        });

        test('set rejette une feature inconnue', async () => {
            const reg = makeRegistry();
            await assert.rejects(
                () => reg.set('guild-1', 'nope', { enabled: true }),
                /Feature inconnue/
            );
        });

        test('set requiert un guildId', async () => {
            const reg = makeRegistry();
            reg.define('x', { defaults: {} });
            await assert.rejects(
                () => reg.set(null, 'x', {}),
                /guildId/
            );
        });

        test('set persiste et recharge avec les nouvelles valeurs', async () => {
            const reg = makeRegistry();
            reg.define('logs_feat', {
                defaults: { enabled: false, channels: { moderation: null } }
            });
            const resSet = await reg.set('702103057898668072', 'logs_feat', {
                enabled: true,
                config: { channels: { moderation: '123456789' } },
                allowedRoles: ['987654321']
            });

            assert.strictEqual(resSet.enabled, true);
            assert.strictEqual(resSet.config.channels.moderation, '123456789');
            assert.deepStrictEqual(resSet.allowedRoles, ['987654321']);

            // Vérifier que le fichier a été créé
            const filePath = path.join(TEST_DATA_DIR, '702103057898668072', 'logs_feat.config.yml');
            assert.ok(fs.existsSync(filePath));

            // Recharger et vérifier
            const fromFile = await reg.get('702103057898668072', 'logs_feat');
            assert.strictEqual(fromFile.enabled, true);
            assert.strictEqual(fromFile.config.channels.moderation, '123456789');
            assert.deepStrictEqual(fromFile.allowedRoles, ['987654321']);
        });
    });

    describe('listForGuild', () => {
        test('combine define et état par défaut', async () => {
            const reg = makeRegistry();
            reg.define('a', { defaults: { enabled: false } });
            reg.define('b', { defaults: { enabled: true, x: 1 } });
            const list = await reg.listForGuild('guild-1');
            assert.strictEqual(list.length, 2);
            const names = list.map(f => f.name).sort();
            assert.deepStrictEqual(names, ['a', 'b']);
        });
    });

    describe('canUse', () => {
        test('refuse si la feature est désactivée', async () => {
            const reg = makeRegistry();
            reg.define('f1', { defaults: { enabled: false, allowed_roles: [] } });
            const r = await reg.canUse('guild-1', 'user-1', 'f1');
            assert.strictEqual(r.allowed, false);
            assert.strictEqual(r.reason, 'disabled');
        });

        test('autorise si la feature est activée sans restriction de rôles', async () => {
            const reg = makeRegistry();
            reg.define('f2', { defaults: { enabled: true, allowed_roles: [] } });
            const r = await reg.canUse('guild-1', 'user-1', 'f2');
            assert.strictEqual(r.allowed, true);
        });
    });

    describe('_reset', () => {
        test('clears all features and aliases', () => {
            const reg = makeRegistry();
            reg.define('test', { defaults: {} });
            reg._reset();
            assert.strictEqual(reg.list().length, 0);
        });
    });
});
