const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Tentative de chargement d'un parseur YAML (yaml ou js-yaml)
let yaml = null;
try {
    yaml = require('yaml');
} catch (e1) {
    try {
        yaml = require('js-yaml');
    } catch (e2) {
        yaml = null;
    }
}

// Emplacement des données de configuration
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

let activeConfigPath = null;
let currentConfig = null;

/**
 * Fusion profonde d'objets (deep merge immuable)
 */
function _deepMerge(target, source) {
    if (source == null) return target;
    if (target == null) return source;
    if (typeof source !== 'object' || Array.isArray(source)) return source;
    const out = { ...target };
    for (const key of Object.keys(source)) {
        if (
            typeof source[key] === 'object' &&
            source[key] !== null &&
            !Array.isArray(source[key]) &&
            typeof target[key] === 'object' &&
            target[key] !== null &&
            !Array.isArray(target[key])
        ) {
            out[key] = _deepMerge(target[key], source[key]);
        } else {
            out[key] = source[key];
        }
    }
    return out;
}

/**
 * Simple parser fallback si aucune lib YAML n'est disponible
 */
function basicYamlParse(content) {
    const lines = content.split(/\r?\n/);
    const result = {};
    const stack = [{ obj: result, indent: -1 }];

    for (let rawLine of lines) {
        const line = rawLine.replace(/#.*$/, '');
        if (!line.trim()) continue;

        const indent = rawLine.search(/\S/);
        const trimmed = line.trim();

        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        const current = stack[stack.length - 1].obj;

        if (trimmed.startsWith('- ')) {
            const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
            continue;
        }

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
            const key = trimmed.slice(0, colonIdx).trim();
            let val = trimmed.slice(colonIdx + 1).trim();

            if (val === '' || val === null) {
                const newObj = {};
                current[key] = newObj;
                stack.push({ obj: newObj, indent });
            } else {
                if (val === 'true') val = true;
                else if (val === 'false') val = false;
                else if (val === 'null' || val === '~') val = null;
                else if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
                else if (/^-?\d+\.\d+$/.test(val)) val = parseFloat(val);
                else if (val.startsWith('[') && val.endsWith(']')) {
                    try {
                        val = JSON.parse(val);
                    } catch {
                        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
                    }
                } else {
                    val = val.replace(/^["']|["']$/g, '');
                }
                current[key] = val;
            }
        }
    }
    return result;
}

/**
 * Charge et parse un fichier YAML
 * @returns {object}
 */
function loadYamlFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return {};
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content || !content.trim()) {
            return {};
        }
        if (yaml && typeof yaml.parse === 'function') {
            return yaml.parse(content) || {};
        } else if (yaml && typeof yaml.load === 'function') {
            return yaml.load(content) || {};
        } else {
            return basicYamlParse(content);
        }
    } catch (err) {
        console.warn(`[Config] Erreur lecture ${filePath}:`, err.message);
        return {};
    }
}

/**
 * Définit récursivement une valeur par clé imbriquée
 */
function setDeep(obj, pathArr, value) {
    let curr = obj;
    for (let i = 0; i < pathArr.length - 1; i++) {
        const key = pathArr[i];
        if (!curr[key] || typeof curr[key] !== 'object') {
            curr[key] = {};
        }
        curr = curr[key];
    }
    curr[pathArr[pathArr.length - 1]] = value;
}

/**
 * Convertit une valeur texte d'environnement en type approprié
 */
function parseEnvValue(val) {
    if (val === undefined || val === null) return val;
    if (typeof val !== 'string') return val;
    const lower = val.toLowerCase().trim();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null' || lower === '') return null;
    if (/^-?\d+$/.test(val)) return parseInt(val, 10);
    if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
    return val;
}

/**
 * Applique toutes les surcharges de variables d'environnement sur l'objet config
 * et rétro-alimente process.env pour garantir la compatibilité
 * @param {object} config
 */
function applyEnvironmentOverrides(config) {
    if (!config || typeof config !== 'object') return config;

    // Assurer la présence des structures d'infrastructure globale
    config.database = config.database || {};
    config.database.type = config.database.type || 'postgres';

    config.web = config.web || {};
    config.web.auth = config.web.auth || { enabled: false, api_key: "changez_cette_cle_secrete", protect_static: false, allowed_ips: [] };
    config.web.auth.allowed_ips = config.web.auth.allowed_ips || [];

    config.scheduler = config.scheduler || { enabled: true, timezone: "Europe/Paris", tasks: {} };
    config.scheduler.tasks = config.scheduler.tasks || {};
    config.scheduler.tasks.bump_reminders = config.scheduler.tasks.bump_reminders || { enabled: true, cron: "* * * * *" };
    config.scheduler.tasks.daily_preview = config.scheduler.tasks.daily_preview || { enabled: true, cron: "0 21 * * *" };
    config.scheduler.tasks.daily_publish = config.scheduler.tasks.daily_publish || { enabled: true, cron: "0 9 * * *" };
    config.scheduler.tasks.daily_autovalidate = config.scheduler.tasks.daily_autovalidate || { enabled: true, cron: "0 11 * * *" };

    config.discord = config.discord || {};
    config.discord.commands = config.discord.commands || { enabled: true, allowed_roles: [], allowed_users: [], allowed_channels: [], permissions: {} };
    config.discord.commands.allowed_roles = config.discord.commands.allowed_roles || [];
    config.discord.commands.allowed_users = config.discord.commands.allowed_users || [];
    config.discord.commands.allowed_channels = config.discord.commands.allowed_channels || [];
    config.discord.commands.permissions = config.discord.commands.permissions || {};

    config.openrouter = config.openrouter || {};
    config.logger = config.logger || { level: 'info', format: 'json', console: true, file: { enabled: true, path: './data/logs' } };
    config.features = config.features || {};

    const env = process.env;

    // 1. Database
    if (env.DATABASE_URL && env.DATABASE_URL !== 'votre_bdd') {
        config.database.url = env.DATABASE_URL;
    } else if (env.DB_URL && env.DB_URL !== 'votre_bdd') {
        config.database.url = env.DB_URL;
    } else if (env.DB_PATH) {
        config.database.url = env.DB_PATH;
    }

    // 2. Web & Server
    if (!config.web?.port) {
        if (env.PORT) {
            config.web.port = parseInt(env.PORT, 10) || 3000;
        } else {
            config.web.port = 3000;
        }
    }
    if (env.NODE_ENV) {
        config.web.node_env = env.NODE_ENV;
    }

    // Web & API Auth
    if (env.WEB_AUTH_ENABLED !== undefined) config.web.auth.enabled = parseEnvValue(env.WEB_AUTH_ENABLED);
    if (env.WEB_API_KEY || env.API_KEY) config.web.auth.api_key = env.WEB_API_KEY || env.API_KEY;
    if (env.WEB_PROTECT_STATIC !== undefined) config.web.auth.protect_static = parseEnvValue(env.WEB_PROTECT_STATIC);

    // Discord & Commands
    if (env.DISCORD_TOKEN || env.BOT_TOKEN) config.discord.token = env.DISCORD_TOKEN || env.BOT_TOKEN;
    if (env.CLIENT_ID) config.discord.client_id = env.CLIENT_ID;
    if (env.GUILD_ID) config.discord.guild_id = env.GUILD_ID;
    if (env.BOT_COLOR) config.discord.default_color = env.BOT_COLOR;
    if (env.COMMANDS_ENABLED !== undefined || env.DISCORD_COMMANDS_ENABLED !== undefined) {
        config.discord.commands.enabled = parseEnvValue(env.COMMANDS_ENABLED ?? env.DISCORD_COMMANDS_ENABLED);
    }

    // Scheduler
    if (env.SCHEDULER_ENABLED !== undefined) config.scheduler.enabled = parseEnvValue(env.SCHEDULER_ENABLED);
    if (env.SCHEDULER_TIMEZONE) config.scheduler.timezone = env.SCHEDULER_TIMEZONE;
    if (env.DAILY_PREVIEW_CRON) config.scheduler.tasks.daily_preview.cron = env.DAILY_PREVIEW_CRON;
    if (env.DAILY_PUBLISH_CRON) config.scheduler.tasks.daily_publish.cron = env.DAILY_PUBLISH_CRON;
    if (env.DAILY_AUTOVALIDATE_CRON) config.scheduler.tasks.daily_autovalidate.cron = env.DAILY_AUTOVALIDATE_CRON;

    // OpenRouter
    if (env.OPENROUTER_API_KEY) config.openrouter.api_key = env.OPENROUTER_API_KEY;
    if (env.OPENROUTER_MODEL) config.openrouter.default_model = env.OPENROUTER_MODEL;
    if (env.OPENROUTER_MAX_TOKENS) config.openrouter.max_tokens = parseInt(env.OPENROUTER_MAX_TOKENS, 10);
    if (env.OPENROUTER_TEMPERATURE) config.openrouter.temperature = parseFloat(env.OPENROUTER_TEMPERATURE);

    // Surcharges dynamiques via double underscore (ex: DISCORD__TOKEN, etc.)
    for (const [rawKey, rawVal] of Object.entries(env)) {
        if (!rawVal) continue;
        if (rawKey.includes('__')) {
            const pathArr = rawKey.toLowerCase().split('__');
            setDeep(config, pathArr, parseEnvValue(rawVal));
        }
    }

    // Compatibilité descendante sans pollution YAML (getters non-énumérables)
    if (!Object.getOwnPropertyDescriptor(config, 'database_url')) {
        Object.defineProperty(config, 'database_url', {
            get() { return this.database?.url; },
            set(val) { if (this.database) this.database.url = val; },
            enumerable: false,
            configurable: true
        });
    }

    if (!Object.getOwnPropertyDescriptor(config, 'port')) {
        Object.defineProperty(config, 'port', {
            get() { return this.web?.port || 3000; },
            set(val) { if (this.web) this.web.port = val; },
            enumerable: false,
            configurable: true
        });
    }

    if (!Object.getOwnPropertyDescriptor(config, 'node_env')) {
        Object.defineProperty(config, 'node_env', {
            get() { return this.web?.node_env || process.env.NODE_ENV || 'development'; },
            set(val) { if (this.web) this.web.node_env = val; },
            enumerable: false,
            configurable: true
        });
    }

    // Rétro-alimentation de process.env pour garantir la compatibilité des bibliothèques
    if (config.discord?.token) {
        if (!process.env.DISCORD_TOKEN) process.env.DISCORD_TOKEN = config.discord.token;
        if (!process.env.BOT_TOKEN) process.env.BOT_TOKEN = config.discord.token;
    }
    if (config.discord?.client_id && !process.env.CLIENT_ID) process.env.CLIENT_ID = config.discord.client_id;
    if (config.discord?.guild_id && !process.env.GUILD_ID) process.env.GUILD_ID = config.discord.guild_id;
    if (config.discord?.default_color && !process.env.BOT_COLOR) process.env.BOT_COLOR = config.discord.default_color;

    if (config.database?.url && config.database.url !== 'votre_bdd') {
        if (!process.env.DATABASE_URL) process.env.DATABASE_URL = config.database.url;
        if (!process.env.DB_URL) process.env.DB_URL = config.database.url;
    }

    if (config.openrouter?.api_key && !process.env.OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = config.openrouter.api_key;
    if (config.openrouter?.default_model && !process.env.OPENROUTER_MODEL) process.env.OPENROUTER_MODEL = config.openrouter.default_model;

    return config;
}

/**
 * Trouve le chemin du fichier de configuration actif en écriture
 * @returns {string}
 */
function resolveConfigPath() {
    if (process.env.CONFIG_PATH && fs.existsSync(process.env.CONFIG_PATH)) {
        return path.resolve(process.env.CONFIG_PATH);
    }

    const localPath = path.join(DATA_DIR, 'local.config.yml');
    if (fs.existsSync(localPath)) return localPath;

    const env = process.env.NODE_ENV;
    if (env) {
        const envPath = path.join(DATA_DIR, `${env}.config.yml`);
        if (fs.existsSync(envPath)) return envPath;
    }

    const basePath = path.join(DATA_DIR, 'base.config.yml');
    if (fs.existsSync(basePath)) return basePath;

    // Legacy fallback si config.yml existe à la racine
    const legacyPath = path.join(PROJECT_ROOT, 'config.yml');
    if (fs.existsSync(legacyPath)) return legacyPath;

    return localPath;
}

/**
 * Initialise et charge la configuration complète via cascade c12 (data/base -> env -> local -> env vars)
 */
function initConfig() {
    let merged = {};
    const loadedFiles = [];

    // 1. data/base.config.yml
    const basePath = path.join(DATA_DIR, 'base.config.yml');
    if (fs.existsSync(basePath)) {
        merged = _deepMerge(merged, loadYamlFile(basePath));
        loadedFiles.push('data/base.config.yml');
    }

    // 2. data/{NODE_ENV}.config.yml
    const env = process.env.NODE_ENV;
    if (env) {
        const envPath = path.join(DATA_DIR, `${env}.config.yml`);
        if (fs.existsSync(envPath)) {
            merged = _deepMerge(merged, loadYamlFile(envPath));
            loadedFiles.push(`data/${env}.config.yml`);
        }
    }

    // 3. data/local.config.yml (si présent)
    const localPath = path.join(DATA_DIR, 'local.config.yml');
    if (fs.existsSync(localPath)) {
        merged = _deepMerge(merged, loadYamlFile(localPath));
        loadedFiles.push('data/local.config.yml');
    }

    // 4. CONFIG_PATH spécifique si défini
    if (process.env.CONFIG_PATH && fs.existsSync(process.env.CONFIG_PATH)) {
        const customPath = path.resolve(process.env.CONFIG_PATH);
        merged = _deepMerge(merged, loadYamlFile(customPath));
        loadedFiles.push(process.env.CONFIG_PATH);
    }

    // 5. Legacy fallback si aucun fichier data/* n'a été trouvé mais config.yml racine existe
    if (loadedFiles.length === 0) {
        const legacyPath = path.join(PROJECT_ROOT, 'config.yml');
        if (fs.existsSync(legacyPath)) {
            merged = _deepMerge(merged, loadYamlFile(legacyPath));
            loadedFiles.push('config.yml');
        }
    }

    activeConfigPath = resolveConfigPath();
    console.log(`📄 [Config] Chargement de la configuration depuis : ${loadedFiles.join(' + ') || activeConfigPath}`);

    currentConfig = applyEnvironmentOverrides(merged);

    return currentConfig;
}

/**
 * Sections globales autorisées dans les fichiers de configuration globale (base / env / local)
 */
const GLOBAL_CONFIG_SECTIONS = ['database', 'web', 'openrouter', 'discord', 'logger', 'features', 'scheduler'];

/**
 * Nettoie un objet de configuration globale pour ne conserver que les blocs d'infrastructure valides
 * @param {object} rawConfig
 * @returns {object}
 */
function cleanGlobalConfigObject(rawConfig) {
    if (!rawConfig || typeof rawConfig !== 'object') return {};
    const clean = {};
    for (const key of GLOBAL_CONFIG_SECTIONS) {
        if (rawConfig[key] !== undefined) {
            clean[key] = rawConfig[key];
        }
    }
    return clean;
}

/**
 * Obtient la configuration courante (la charge si non encore chargée)
 * @returns {object}
 */
function getConfig() {
    if (!currentConfig) {
        return initConfig();
    }
    return currentConfig;
}

/**
 * Sauvegarde la configuration globale dans le fichier YAML actif (sans polluer avec les modules features)
 * @param {object} newConfig
 */
function saveConfig(newConfig) {
    currentConfig = newConfig;
    const targetFile = activeConfigPath || resolveConfigPath();
    const tmpFile = `${targetFile}.tmp.${process.pid}.${Date.now()}`;

    const sanitizedConfig = cleanGlobalConfigObject(newConfig);

    try {
        if (yaml && typeof yaml.stringify === 'function') {
            fs.writeFileSync(tmpFile, yaml.stringify(sanitizedConfig), 'utf-8');
        } else if (yaml && typeof yaml.dump === 'function') {
            const yamlStr = yaml.dump(sanitizedConfig, {
                indent: 2,
                lineWidth: -1,
                noRefs: true
            });
            fs.writeFileSync(tmpFile, yamlStr, 'utf-8');
        } else {
            fs.writeFileSync(tmpFile, JSON.stringify(sanitizedConfig, null, 2), 'utf-8');
        }
        fs.renameSync(tmpFile, targetFile);
        console.log(`💾 [Config] Configuration sauvegardée avec succès dans ${targetFile}`);
    } catch (err) {
        if (fs.existsSync(tmpFile)) {
            try { fs.unlinkSync(tmpFile); } catch (e) { console.warn('[Config] Impossible de supprimer le fichier temporaire:', e.message); }
        }
        throw err;
    }
}

/**
 * Sauvegarde un module spécifique.
 * Si c'est une section globale (web, discord, features, etc.), met à jour la config globale.
 * Si c'est une feature (welcome, captcha, xp, daily_message, etc.), sauvegarde dans le dossier guilde via c12.
 * @param {string} moduleName
 * @param {object} moduleData
 * @param {string} [guildId]
 */
function saveModuleConfig(moduleName, moduleData, guildId = null) {
    if (!moduleName) return;

    if (GLOBAL_CONFIG_SECTIONS.includes(moduleName)) {
        const config = getConfig();
        config[moduleName] = moduleData;
        saveConfig(config);
        return config;
    }

    // C'est un module / feature : enregistrer dans data/{guildId}/{moduleName}.config.yml
    const targetGuildId = guildId || process.env.GUILD_ID || '1543570824542298122';
    try {
        const { setFeatureConfig } = require('./c12-loader.js');
        setFeatureConfig(targetGuildId, moduleName, moduleData).catch(err => {
            console.warn(`[Config] Erreur setFeatureConfig(${targetGuildId}, ${moduleName}):`, err.message);
        });
    } catch (err) {
        console.warn(`[Config] Impossible de charger c12-loader pour ${moduleName}:`, err.message);
    }
    return moduleData;
}

// Initialisation immédiate au chargement du module
initConfig();

module.exports = {
    getConfig,
    initConfig,
    saveConfig,
    saveModuleConfig,
    resolveConfigPath,
    applyEnvironmentOverrides,
    cleanGlobalConfigObject,
    GLOBAL_CONFIG_SECTIONS,
    _deepMerge,
    get config() {
        return getConfig();
    }
};
