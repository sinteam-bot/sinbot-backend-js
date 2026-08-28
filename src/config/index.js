const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Tentative de chargement d'un parseur YAML (js-yaml ou yaml)
let yaml = null;
try {
    yaml = require('js-yaml');
} catch (e1) {
    try {
        yaml = require('yaml');
    } catch (e2) {
        yaml = null;
    }
}

// Emplacement racine du projet
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CONFIG_FILE_CANDIDATES = [
    process.env.CONFIG_PATH ? path.resolve(process.env.CONFIG_PATH) : null,
    path.join(PROJECT_ROOT, 'config.yml'),
    path.join(PROJECT_ROOT, 'config.yaml'),
    path.join(PROJECT_ROOT, 'config.example.yml')
].filter(Boolean);

let activeConfigPath = null;
let currentConfig = null;

/**
 * Trouve le chemin du fichier de configuration actif
 * @returns {string}
 */
function resolveConfigPath() {
    for (const candidate of CONFIG_FILE_CANDIDATES) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    // Fallback par défaut vers config.yml dans la racine
    return path.join(PROJECT_ROOT, 'config.yml');
}

/**
 * Simple parser fallback si js-yaml n'est pas encore installé
 */
function basicYamlParse(content) {
    const lines = content.split(/\r?\n/);
    const result = {};
    const stack = [{ obj: result, indent: -1 }];

    for (let rawLine of lines) {
        // Ignorer les commentaires et lignes vides
        const line = rawLine.replace(/#.*$/, '');
        if (!line.trim()) continue;

        const indent = rawLine.search(/\S/);
        const trimmed = line.trim();

        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        const current = stack[stack.length - 1].obj;

        if (trimmed.startsWith('- ')) {
            // Liste élément simple
            const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
            if (!Array.isArray(current)) {
                // On ne modifie pas si ce n'est pas un tableau
            }
            continue;
        }

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
            const key = trimmed.slice(0, colonIdx).trim();
            let val = trimmed.slice(colonIdx + 1).trim();

            if (val === '' || val === null) {
                // Début d'un sous-objet
                const newObj = {};
                current[key] = newObj;
                stack.push({ obj: newObj, indent });
            } else {
                // Valeur scalaire
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
 * Charge et parse le fichier YAML
 * @returns {object}
 */
function loadYamlFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content || !content.trim()) {
            return {};
        }
        if (yaml && typeof yaml.load === 'function') {
            return yaml.load(content) || {};
        } else if (yaml && typeof yaml.parse === 'function') {
            return yaml.parse(content) || {};
        } else {
            return basicYamlParse(content);
        }
    } catch (err) {
        return {};
    }
}

/**
 * Définit récursivement une valeur par clé imbriquée (ex: "discord.token" ou "daily_message.ai_config.model")
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
 * Convertit une valeur texte d'environnement en type approprié (bool, number, string)
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
 * @param {object} config
 */
function applyEnvironmentOverrides(config) {
    if (!config || typeof config !== 'object') return config;

    // Assurer la présence des sous-objets
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
    config.startup_notifier = config.startup_notifier || {};
    config.startup_notifier.github = config.startup_notifier.github || {};
    config.daily_message = config.daily_message || {};
    config.daily_message.ai_config = config.daily_message.ai_config || {};
    config.captcha = config.captcha || {};
    config.welcome = config.welcome || {};
    config.xp = config.xp|| {};

    config.counter = config.counter || {};
    config.counter.emojis = config.counter.emojis || {};
    config.counter.messages = config.counter.messages || {};

    config.countdown = config.countdown || {};
    config.countdown.emojis = config.countdown.emojis || {};
    config.countdown.messages = config.countdown.messages || {};

    config.bump_reminder = config.bump_reminder || config.bump_reminders || {};
    config.bump_reminders = config.bump_reminder;
    config.bump_reminder.messages = config.bump_reminder.messages || {};

    const env = process.env;

    // 1. Mappages explicites directs
    if (env.DB_PATH) config.db_path = env.DB_PATH;
    if (env.PORT) {
        config.port = parseInt(env.PORT, 10) || config.port || 3000;
        config.web.port = config.port;
    }
    if (env.NODE_ENV) {
        config.node_env = env.NODE_ENV;
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

    // Counter & Countdown
    if (env.COUNTER_CHANNEL_ID) config.counter.channel_id = env.COUNTER_CHANNEL_ID;
    if (env.COUNTDOWN_CHANNEL_ID) config.countdown.channel_id = env.COUNTDOWN_CHANNEL_ID;

    // OpenRouter
    if (env.OPENROUTER_API_KEY) config.openrouter.api_key = env.OPENROUTER_API_KEY;
    if (env.OPENROUTER_MODEL) config.openrouter.default_model = env.OPENROUTER_MODEL;
    if (env.OPENROUTER_MAX_TOKENS) config.openrouter.max_tokens = parseInt(env.OPENROUTER_MAX_TOKENS, 10);
    if (env.OPENROUTER_TEMPERATURE) config.openrouter.temperature = parseFloat(env.OPENROUTER_TEMPERATURE);

    // Notifications & GitHub
    if (env.LOG_CHANNEL_ID || env.NOTIFICATION_CHANNEL_ID) {
        config.startup_notifier.channel_id = env.LOG_CHANNEL_ID || env.NOTIFICATION_CHANNEL_ID;
    }
    if (env.GIT_COMMIT_SHA) config.startup_notifier.last_commit_sha = env.GIT_COMMIT_SHA;
    if (env.GITHUB_REPO) config.startup_notifier.github.repo = env.GITHUB_REPO;
    if (env.GITHUB_TOKEN) config.startup_notifier.github.token = env.GITHUB_TOKEN;

    // Daily Message
    if (env.DAILY_MESSAGE_CHANNEL_ID) config.daily_message.channel_id = env.DAILY_MESSAGE_CHANNEL_ID;
    if (env.DAILY_MESSAGE_PREVIEW_CHANNEL_ID) config.daily_message.preview_channel_id = env.DAILY_MESSAGE_PREVIEW_CHANNEL_ID;

    // Captcha
    if (env.CAPTCHA_ENABLED !== undefined) config.captcha.enabled = parseEnvValue(env.CAPTCHA_ENABLED);
    if (env.CAPTCHA_CHANNEL_ID) config.captcha.channel_id = env.CAPTCHA_CHANNEL_ID;
    if (env.VERIFIED_ROLE_ID) config.captcha.verified_role_id = env.VERIFIED_ROLE_ID;

    // Welcome
    if (env.WELCOME_ENABLED !== undefined) config.welcome.enabled = parseEnvValue(env.WELCOME_ENABLED);
    if (env.WELCOME_CHANNEL_ID) config.welcome.channel_id = env.WELCOME_CHANNEL_ID;

    // Bump Reminder
    if (env.BUMP_REMINDER_ENABLED !== undefined) config.bump_reminder.enabled = parseEnvValue(env.BUMP_REMINDER_ENABLED);
    if (env.BUMP_REMINDER_CHANNEL_ID) config.bump_reminder.channel_id = env.BUMP_REMINDER_CHANNEL_ID;
    if (env.BUMP_REMINDER_ROLE_ID) config.bump_reminder.role_id = env.BUMP_REMINDER_ROLE_ID;
    if (env.BUMP_REMINDER_COOLDOWN_HOURS) config.bump_reminder.reminder_cooldown_hours = Number(env.BUMP_REMINDER_COOLDOWN_HOURS);

    // 2. Surcharges dynamiques via double underscore (ex: DISCORD__TOKEN, DAILY_MESSAGE__CHANNEL_ID, etc.)
    for (const [rawKey, rawVal] of Object.entries(env)) {
        if (!rawVal) continue;
        if (rawKey.includes('__')) {
            const pathArr = rawKey.toLowerCase().split('__');
            setDeep(config, pathArr, parseEnvValue(rawVal));
        }
    }

    // 3. Rétro-alimentation de process.env pour garantir la compatibilité de toutes les librairies existantes
    if (config.discord?.token) {
        if (!process.env.DISCORD_TOKEN) process.env.DISCORD_TOKEN = config.discord.token;
        if (!process.env.BOT_TOKEN) process.env.BOT_TOKEN = config.discord.token;
    }
    if (config.discord?.client_id && !process.env.CLIENT_ID) process.env.CLIENT_ID = config.discord.client_id;
    if (config.discord?.guild_id && !process.env.GUILD_ID) process.env.GUILD_ID = config.discord.guild_id;
    if (config.discord?.default_color && !process.env.BOT_COLOR) process.env.BOT_COLOR = config.discord.default_color;

    if (config.openrouter?.api_key && !process.env.OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = config.openrouter.api_key;
    if (config.openrouter?.default_model && !process.env.OPENROUTER_MODEL) process.env.OPENROUTER_MODEL = config.openrouter.default_model;

    if (config.startup_notifier?.channel_id) {
        if (!process.env.LOG_CHANNEL_ID) process.env.LOG_CHANNEL_ID = config.startup_notifier.channel_id;
        if (!process.env.NOTIFICATION_CHANNEL_ID) process.env.NOTIFICATION_CHANNEL_ID = config.startup_notifier.channel_id;
    }
    if (config.daily_message?.channel_id && !process.env.DAILY_MESSAGE_CHANNEL_ID) {
        process.env.DAILY_MESSAGE_CHANNEL_ID = config.daily_message.channel_id;
    }
    if (config.db_path && !process.env.DB_PATH) process.env.DB_PATH = config.db_path;
    if (config.port && !process.env.PORT) process.env.PORT = String(config.port);

    return config;
}

/**
 * Initialise et charge la configuration complète
 */
function initConfig() {
    activeConfigPath = resolveConfigPath();
    console.log(`📄 [Config] Chargement du fichier de configuration depuis : ${activeConfigPath}`);

    const baseConfig = loadYamlFile(activeConfigPath);
    currentConfig = applyEnvironmentOverrides(baseConfig);

    return currentConfig;
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
 * Sauvegarde la configuration entière dans le fichier YAML actif
 * @param {object} newConfig
 */
function saveConfig(newConfig) {
    currentConfig = newConfig;
    const targetFile = activeConfigPath || path.join(PROJECT_ROOT, 'config.yml');
    const tmpFile = `${targetFile}.tmp.${process.pid}.${Date.now()}`;

    try {
        if (yaml && typeof yaml.dump === 'function') {
            const yamlStr = yaml.dump(newConfig, {
                indent: 2,
                lineWidth: -1,
                noRefs: true
            });
            fs.writeFileSync(tmpFile, yamlStr, 'utf-8');
        } else {
            // Fallback si pas de lib dump
            fs.writeFileSync(tmpFile, JSON.stringify(newConfig, null, 2), 'utf-8');
        }
        fs.renameSync(tmpFile, targetFile);
        console.log(`💾 [Config] Configuration sauvegardée avec succès dans ${targetFile}`);
    } catch (err) {
        if (fs.existsSync(tmpFile)) {
            try { fs.unlinkSync(tmpFile); } catch (e) {}
        }
        throw err;
    }
}

/**
 * Sauvegarde un module spécifique dans la configuration
 * @param {string} moduleName - 'welcome', 'captcha', 'xp', 'daily_message', etc.
 * @param {object} moduleData - Les nouvelles données du module
 */
function saveModuleConfig(moduleName, moduleData) {
    const config = getConfig();

    config[moduleName] = moduleData;

    saveConfig(config);
    return config;
}

// Initialisation immédiate au chargement du module
initConfig();

module.exports = {
    getConfig,
    initConfig,
    saveConfig,
    saveModuleConfig,
    resolveConfigPath,
    get config() {
        return getConfig();
    }
};
