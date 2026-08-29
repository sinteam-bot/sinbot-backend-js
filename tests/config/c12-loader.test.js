/**
 * tests/config/c12-loader.test.js
 *
 * Phase 4 : tests du wrapper c12-loader.
 * Couvre l'héritage de fichiers, l'écriture atomique, l'init de data dir.
 */

const assert = require('node:assert');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const {
    getGlobalConfig,
    getFeatureConfig,
    setFeatureConfig,
    initGuildDataDir
} = require('../../src/config/c12-loader.js');

// Surcharge DATA_DIR pour les tests (on isole dans un tmp)
const TEST_DATA_DIR = path.join(os.tmpdir(), `c12-loader-test-${Date.now()}`);

async function setupTestData() {
    // Créer la structure
    await fsp.mkdir(path.join(TEST_DATA_DIR, 'common'), { recursive: true });
    await fsp.mkdir(path.join(TEST_DATA_DIR, 'example'), { recursive: true });
    await fsp.mkdir(path.join(TEST_DATA_DIR, 'default'), { recursive: true });

    // data/common/base.yml
    await fsp.writeFile(
        path.join(TEST_DATA_DIR, 'common', 'config.yml'),
        'database:\n  url: "postgres://test"\nweb:\n  port: 1234\n',
        'utf8'
    );

    // data/example/xp.config.yml (c12 cherche ce nom exact)
    await fsp.writeFile(
        path.join(TEST_DATA_DIR, 'example', 'xp.config.yml'),
        'enabled: false\nxp_per_message: 5\nlevel_threshold: 100\n',
        'utf8'
    );

    // data/default/xp.config.yml (admin override)
    await fsp.writeFile(
        path.join(TEST_DATA_DIR, 'default', 'xp.config.yml'),
        'enabled: true\nxp_per_message: 10\n',
        'utf8'
    );
}

// Patch le module c12-loader pour pointer sur TEST_DATA_DIR
function patchDataDir() {
    const mod = require('../../src/config/c12-loader.js');
    mod.DATA_DIR = TEST_DATA_DIR;
    mod.COMMON_DIR = path.join(TEST_DATA_DIR, 'common');
    mod.DEFAULT_DIR = path.join(TEST_DATA_DIR, 'default');
    mod.EXAMPLE_DIR = path.join(TEST_DATA_DIR, 'example');
    // Vider les caches internes
    mod._featureCache?.clear?.();
    return mod;
}

describe('c12-loader (Phase 4)', () => {
    beforeEach(async () => {
        await setupTestData();
    });

    afterEach(async () => {
        // Cleanup
        try {
            await fsp.rm(TEST_DATA_DIR, { recursive: true, force: true });
        } catch {}
    });

    describe('getGlobalConfig', () => {
        test('charge data/common/*.yml', async () => {
            const mod = patchDataDir();
            const cfg = await mod.getGlobalConfig({ fresh: true });
            assert.strictEqual(cfg.database.url, 'postgres://test');
            assert.strictEqual(cfg.web.port, 1234);
        });
    });

    describe('getFeatureConfig : héritage', () => {
        test('cascade example → default → guild', async () => {
            // Créer un override guilde
            const guildId = '999';
            await fsp.mkdir(path.join(TEST_DATA_DIR, guildId), { recursive: true });
            await fsp.writeFile(
                path.join(TEST_DATA_DIR, guildId, 'xp.config.yml'),
                'xp_per_message: 20\nrole: "admin"\n',
                'utf8'
            );

            const mod = patchDataDir();
            const cfg = await mod.getFeatureConfig(guildId, 'xp', { fresh: true });

            // example = { enabled: false, xp_per_message: 5, level_threshold: 100 }
            // default = { enabled: true, xp_per_message: 10 } → écrase example
            // guild   = { xp_per_message: 20, role: 'admin' } → écrase default

            assert.strictEqual(cfg.enabled, true, 'default écrase example (enabled)');
            assert.strictEqual(cfg.xp_per_message, 20, 'guild écrase default (xp_per_message)');
            assert.strictEqual(cfg.level_threshold, 100, 'example preserved');
            assert.strictEqual(cfg.role, 'admin', 'guild spécifique');
        });

        test('retourne {} si aucun fichier n\'existe', async () => {
            const mod = patchDataDir();
            const cfg = await mod.getFeatureConfig('123', 'unknown_feature', { fresh: true });
            assert.deepStrictEqual(cfg, {});
        });
    });

    describe('setFeatureConfig', () => {
        test('écrit atomiquement et met à jour le cache', async () => {
            const guildId = '888';
            const mod = patchDataDir();
            const result = await mod.setFeatureConfig(guildId, 'xp', {
                enabled: true,
                xp_per_message: 50
            });
            assert.strictEqual(result.enabled, true);
            assert.strictEqual(result.xp_per_message, 50);
            // Le fichier doit exister
            const filePath = path.join(TEST_DATA_DIR, guildId, 'xp.config.yml');
            assert.ok(fs.existsSync(filePath), 'le fichier doit être créé');
            const content = fs.readFileSync(filePath, 'utf8');
            assert.ok(content.includes('xp_per_message: 50'));
        });

        test('préserve les champs non patchés', async () => {
            const mod = patchDataDir();
            await mod.setFeatureConfig('777', 'xp', { enabled: true });
            await mod.setFeatureConfig('777', 'xp', { role: 'vip' });

            const cfg = await mod.getFeatureConfig('777', 'xp', { fresh: true });
            assert.strictEqual(cfg.enabled, true);
            assert.strictEqual(cfg.role, 'vip');
            assert.strictEqual(cfg.xp_per_message, 10); // du default
        });
    });

    describe('initGuildDataDir', () => {
        test('copie les fichiers de default/ vers data/{guildId}/', async () => {
            const mod = patchDataDir();
            const result = await mod.initGuildDataDir('666');

            assert.ok(fs.existsSync(path.join(TEST_DATA_DIR, '666', 'xp.config.yml')));
            assert.ok(result.created >= 1);
            assert.ok(result.files.includes('xp.config.yml'));
        });

        test('ne copie pas si le fichier existe déjà (no-clobber)', async () => {
            const guildId = '555';
            const mod = patchDataDir();
            // Créer le fichier guilde avec une valeur custom
            await fsp.mkdir(path.join(TEST_DATA_DIR, guildId), { recursive: true });
            await fsp.writeFile(
                path.join(TEST_DATA_DIR, guildId, 'xp.config.yml'),
                'role: "custom_admin"\n',
                'utf8'
            );
            // Lancer init : ne doit PAS écraser
            await mod.initGuildDataDir(guildId);
            const content = fs.readFileSync(
                path.join(TEST_DATA_DIR, guildId, 'xp.config.yml'),
                'utf8'
            );
            assert.ok(content.includes('custom_admin'), 'le fichier ne doit pas être écrasé');
        });
    });
});
