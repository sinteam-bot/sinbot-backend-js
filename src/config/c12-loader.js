/**
 * src/config/c12-loader.js
 *
 * Wrapper autour de c12 (https://github.com/unjs/c12) pour charger
 * la configuration de manière multi-niveaux.
 *
 * Hiérarchie de chargement (par feature, par guilde) :
 *
 *   1. data/example/<feature>.config.example.yml   (defaults code, versionné)
 *   2. data/default/<feature>.config.yml            (defaults admin, gitignore)
 *   3. data/{guildId}/<feature>.config.yml          (override guilde, gitignore)
 *   4. env vars: CONFIG_<FEATURE>_<KEY>              (runtime override)
 *
 * Hiérarchie de chargement (config globale) :
 *
 *   1. data/common/base.yml                        (defaults infra, versionné)
 *   2. data/common/config.yml                      (admin, gitignore)
 *   3. env vars: CONFIG_<KEY>                       (runtime)
 *   4. data/common/{NODE_ENV}.yml                  (production.yml, test.yml)
 *
 * Phase 4 du plan migrate-to-c12.md.
 */

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { loadConfig, watchConfig } = require('c12');
const { eventBus } = require('../core/event-bus.js');

const DATA_DIR = path.resolve(__dirname, '../../data');
const COMMON_DIR = path.join(DATA_DIR, 'common');
const DEFAULT_DIR = path.join(DATA_DIR, 'default');
const EXAMPLE_DIR = path.join(DATA_DIR, 'example');

const WATCH_ENABLED = process.env.NODE_ENV !== 'production';

/**
 * Helper interne : retourne le DATA_DIR courant (peut être patché pour les tests).
 */
function _dataDir() {
    return module.exports.DATA_DIR || DATA_DIR;
}
function _commonDir() {
    return module.exports.COMMON_DIR || COMMON_DIR;
}
function _defaultDir() {
    return module.exports.DEFAULT_DIR || DEFAULT_DIR;
}
function _exampleDir() {
    return module.exports.EXAMPLE_DIR || EXAMPLE_DIR;
}

// ============== Config globale ==============

/**
 * Charge la config globale (data/common/* + env + NODE_ENV).
 * Cache mémoire car c'est lu très souvent.
 */
let _globalConfigCache = null;
let _globalConfigPromise = null;

async function getGlobalConfig(options = {}) {
    if (options.fresh === true) {
        _globalConfigCache = null;
        _globalConfigPromise = null;
    }
    if (_globalConfigCache) return _globalConfigCache;
    if (_globalConfigPromise) return _globalConfigPromise;

    _globalConfigPromise = (async () => {
        const result = await loadConfig({
            cwd: _commonDir(),
            name: 'config',
            envName: process.env.NODE_ENV || undefined
        });
        _globalConfigCache = result.config || {};
        return _globalConfigCache;
    })();

    try {
        return await _globalConfigPromise;
    } finally {
        _globalConfigPromise = null;
    }
}

// ============== Config feature (par guilde) ==============

/**
 * Cache des configs feature par clé `${guildId}:${feature}`.
 * Invalidé sur write ou sur hot reload.
 */
const _featureCache = new Map();
const _watchers = new Map();

/**
 * Charge la config d'une feature pour une guilde.
 * Cascade : example → default → guild → env.
 */
async function getFeatureConfig(guildId, feature, options = {}) {
    if (!feature) throw new Error('feature requis');
    if (!guildId) throw new Error('guildId requis');

    const cacheKey = `${guildId}:${feature}`;
    if (options.fresh !== true && _featureCache.has(cacheKey)) {
        return _featureCache.get(cacheKey);
    }

    const exampleConfig = await _loadFromDir(_exampleDir(), feature);
    const defaultConfig = await _loadFromDir(_defaultDir(), feature);
    const guildDir = path.join(_dataDir(), String(guildId));
    const guildConfig = await _loadFromDir(guildDir, feature);

    const merged = _deepMerge(_deepMerge(exampleConfig, defaultConfig), guildConfig);
    _featureCache.set(cacheKey, merged);
    return merged;
}

async function _loadFromDir(dir, feature) {
    const filePath = path.join(dir, `${feature}.config.yml`);
    if (!fs.existsSync(filePath)) return {};
    const result = await loadConfig({
        cwd: dir,
        name: feature
    });
    return result.config || {};
}

function _deepMerge(target, source) {
    if (source == null) return target;
    if (typeof source !== 'object' || Array.isArray(source)) return source;
    for (const key of Object.keys(source)) {
        if (
            typeof source[key] === 'object' &&
            source[key] !== null &&
            !Array.isArray(source[key]) &&
            typeof target[key] === 'object' &&
            target[key] !== null
        ) {
            target[key] = _deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

/**
 * Écrit un patch dans la config d'une feature pour une guilde.
 * Écriture atomique (write tmp + rename).
 */
async function setFeatureConfig(guildId, feature, patch) {
    if (!guildId) throw new Error('guildId requis');
    if (!feature) throw new Error('feature requis');

    const guildDir = path.join(_dataDir(), String(guildId));
    await fsp.mkdir(guildDir, { recursive: true });

    const filePath = path.join(guildDir, `${feature}.config.yml`);
    const current = await getFeatureConfig(guildId, feature, { fresh: true });
    const next = _deepMerge(current, patch || {});

    // Écriture atomique
    const tmpPath = `${filePath}.tmp.${process.pid}`;
    const yaml = require('yaml');
    await fsp.writeFile(tmpPath, yaml.stringify(next), 'utf8');
    await fsp.rename(tmpPath, filePath);

    // Invalider le cache pour cette clé
    const cacheKey = `${guildId}:${feature}`;
    _featureCache.set(cacheKey, next);

    // Émettre l'event
    try {
        eventBus.emit('feature.updated', { guildId, name: feature, enabled: next.enabled });
    } catch (err) {
        console.warn(`[c12-loader] Erreur émission 'feature.updated':`, err.message);
    }

    return next;
}

/**
 * Initialise le dossier data/{guildId}/ depuis data/default/.
 * Ne copie que les fichiers qui n'existent pas encore (pas d'écrasement).
 * Retourne la liste des fichiers copiés.
 */
async function initGuildDataDir(guildId) {
    if (!guildId) throw new Error('guildId requis');
    const guildDir = path.join(_dataDir(), String(guildId));
    await fsp.mkdir(guildDir, { recursive: true });

    if (!fs.existsSync(_defaultDir())) {
        return { guildId, created: 0, files: [] };
    }

    const files = await fsp.readdir(_defaultDir());
    const copied = [];

    for (const f of files) {
        if (!f.endsWith('.yml')) continue;
        const dest = path.join(guildDir, f);
        try {
            await fsp.access(dest);
            // Le fichier existe déjà : on ne touche pas (pas d'écrasement)
        } catch {
            await fsp.copyFile(path.join(_defaultDir(), f), dest);
            copied.push(f);
        }
    }

    if (copied.length > 0) {
        console.log(`📁 [c12-loader] data/${guildId}/ : ${copied.length} fichier(s) initialisé(s) depuis default/`);
    }

    return { guildId, created: copied.length, files: copied };
}

// ============== Hot reload (dev only) ==============

/**
 * Active le hot reload sur une feature donnée.
 * À chaque modification du YAML, l'event 'feature.updated' est émis.
 */
function watchFeatureConfig(guildId, feature) {
    if (!WATCH_ENABLED) return () => {};
    const cacheKey = `${guildId}:${feature}`;
    if (_watchers.has(cacheKey)) return _watchers.get(cacheKey);

    const guildDir = path.join(_dataDir(), String(guildId));

    const stop = watchConfig({
        cwd: guildDir,
        name: feature,
        onChange: async (event) => {
            console.log(`🔄 [c12-loader] ${cacheKey} rechargé (${event.type})`);
            _featureCache.delete(cacheKey);
            const fresh = await getFeatureConfig(guildId, feature, { fresh: true });
            try {
                eventBus.emit('feature.updated', { guildId, name: feature, enabled: fresh.enabled });
            } catch (err) {
                console.warn(`[c12-loader] Erreur émission 'feature.updated':`, err.message);
            }
        }
    });
    _watchers.set(cacheKey, stop);
    return stop;
}

function unwatchFeatureConfig(guildId, feature) {
    const cacheKey = `${guildId}:${feature}`;
    const stop = _watchers.get(cacheKey);
    if (stop) {
        stop();
        _watchers.delete(cacheKey);
    }
}

function unwatchAll() {
    for (const stop of _watchers.values()) stop();
    _watchers.clear();
}

module.exports = {
    DATA_DIR,
    COMMON_DIR,
    DEFAULT_DIR,
    EXAMPLE_DIR,
    getGlobalConfig,
    getFeatureConfig,
    setFeatureConfig,
    initGuildDataDir,
    watchFeatureConfig,
    unwatchFeatureConfig,
    unwatchAll,
    // Helpers internes (exportés pour les tests)
    _deepMerge
};
