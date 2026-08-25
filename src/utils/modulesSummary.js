const { getConfig } = require('../config/index.js');
const CAPTCHA_CONFIG = require('../modules/security_question/captcha.config.js');
const WELCOME_CONFIG = require('../modules/feature_welcome/welcome.config.js');
const XP_CONFIG = require('../modules/feature_xp-level/xp.config.js');

/**
 * Récupère la liste complète et structurée de tous les modules et leur statut
 * @returns {Array<Object>}
 */
function getModulesStatusList() {
    const config = getConfig();

    const isScheduler = config.scheduler?.enabled !== false;
    const isDaily = config.daily_message?.enabled !== false;
    const isWelcome = !!WELCOME_CONFIG.ENABLED;

    return [
        {
            key: 'startup_notifier',
            name: 'Startup Notifier',
            subFeature: 'Notification GitHub au démarrage',
            category: 'Système',
            icon: '🚀',
            enabled: !!config.startup_notifier?.enabled,
            viewId: 'general-config',
            details: config.startup_notifier?.channel_id ? `Salon : <#${config.startup_notifier.channel_id}>` : 'Salon non configuré'
        },
        {
            key: 'scheduler',
            name: 'Scheduler (Global)',
            subFeature: 'Planificateur de tâches cron',
            category: 'Planification',
            icon: '⏰',
            enabled: isScheduler,
            viewId: 'general-config',
            details: `Fuseau horaire : ${config.scheduler?.timezone || 'Europe/Paris'}`
        },
        {
            key: 'scheduler_bump',
            name: 'Bump Reminders',
            subFeature: 'Rappels automatiques de bump Obsydian (2h)',
            category: 'Planification',
            icon: '🔔',
            enabled: isScheduler && (config.scheduler?.tasks?.bump_reminders?.enabled !== false),
            parent: 'scheduler',
            viewId: 'module-bump-reminder',
            details: `Cron : ${config.scheduler?.tasks?.bump_reminders?.cron || '* * * * *'}`
        },
        {
            key: 'scheduler_preview',
            name: 'Daily Message Preview',
            subFeature: 'Prévisualisation la veille à 21h00',
            category: 'Planification',
            icon: '🌅',
            enabled: isScheduler && isDaily && (config.scheduler?.tasks?.daily_preview?.enabled !== false),
            parent: 'scheduler',
            viewId: 'module-daily-message',
            details: `Cron : ${config.scheduler?.tasks?.daily_preview?.cron || '0 21 * * *'}`
        },
        {
            key: 'scheduler_publish',
            name: 'Daily Message Publish',
            subFeature: 'Publication automatique validée à 09h00',
            category: 'Planification',
            icon: '📢',
            enabled: isScheduler && isDaily && (config.scheduler?.tasks?.daily_publish?.enabled !== false),
            parent: 'scheduler',
            viewId: 'module-daily-message',
            details: `Cron : ${config.scheduler?.tasks?.daily_publish?.cron || '0 9 * * *'}`
        },
        {
            key: 'scheduler_autovalidate',
            name: 'Daily Message AutoValidate',
            subFeature: 'Validation et publication auto à 11h00',
            category: 'Planification',
            icon: '🤖',
            enabled: isScheduler && isDaily && (config.scheduler?.tasks?.daily_autovalidate?.enabled !== false),
            parent: 'scheduler',
            viewId: 'module-daily-message',
            details: `Cron : ${config.scheduler?.tasks?.daily_autovalidate?.cron || '0 11 * * *'}`
        },
        {
            key: 'daily_message',
            name: 'Daily Message (IA)',
            subFeature: 'Génération & publication pensée du jour',
            category: 'Modules IA',
            icon: '🌅',
            enabled: isDaily,
            viewId: 'module-daily-message',
            details: `Modèle : ${config.daily_message?.ai_config?.model || config.openrouter?.default_model || 'Par défaut'}`
        },
        {
            key: 'captcha',
            name: 'Captcha Mathématique',
            subFeature: 'Vérification anti-bot à l\'arrivée',
            category: 'Sécurité',
            icon: '🔒',
            enabled: !!CAPTCHA_CONFIG.ENABLED,
            viewId: 'module-captcha',
            details: `Délai : ${CAPTCHA_CONFIG.CAPTCHA_TIMEOUT || 10} min | Max tentatives : ${CAPTCHA_CONFIG.MAX_ATTEMPTS || 3}`
        },
        {
            key: 'welcome',
            name: 'Système d\'Accueil',
            subFeature: 'Gestion des nouveaux membres & rôles',
            category: 'Communauté',
            icon: '👋',
            enabled: isWelcome,
            viewId: 'module-welcome',
            details: (WELCOME_CONFIG.AUTO_ROLES && WELCOME_CONFIG.AUTO_ROLES.length > 0)
                ? `${WELCOME_CONFIG.AUTO_ROLES.length} rôle(s) auto`
                : 'Aucun rôle auto'
        },
        {
            key: 'welcome_message',
            name: 'Message Bienvenue Public',
            subFeature: 'Embed dans le salon d\'accueil',
            category: 'Communauté',
            icon: '🎉',
            enabled: isWelcome && (WELCOME_CONFIG.WELCOME_MESSAGE?.enabled !== false),
            parent: 'welcome',
            viewId: 'module-welcome',
            details: WELCOME_CONFIG.WELCOME_CHANNEL_ID ? `Salon : <#${WELCOME_CONFIG.WELCOME_CHANNEL_ID}>` : 'Salon auto / non défini'
        },
        {
            key: 'welcome_dm',
            name: 'Message Privé (DM)',
            subFeature: 'Message d\'accueil direct en message privé',
            category: 'Communauté',
            icon: '📩',
            enabled: isWelcome && (WELCOME_CONFIG.SEND_DM !== false) && (WELCOME_CONFIG.DM_MESSAGE?.enabled !== false),
            parent: 'welcome',
            viewId: 'module-welcome',
            details: 'Message privé personnalisé'
        },
        {
            key: 'xp',
            name: 'Système XP & Niveaux',
            subFeature: 'Gain d\'expérience messages & vocal',
            category: 'Gamification',
            icon: '⭐',
            enabled: !!XP_CONFIG.ENABLED,
            viewId: 'module-xp-level',
            details: `${XP_CONFIG.MESSAGE_XP?.MIN || 15}-${XP_CONFIG.MESSAGE_XP?.MAX || 25} XP/msg | ${XP_CONFIG.VOICE_XP?.PER_MINUTE || 2} XP/min vocal`
        },
        {
            key: 'counter',
            name: 'Route de l\'Infini',
            subFeature: 'Jeu du Compteur incrémental',
            category: 'Jeux',
            icon: '🔢',
            enabled: !!config.counter?.enabled,
            viewId: 'game-road-to-infinite',
            details: config.counter?.channel_id ? `Salon : <#${config.counter.channel_id}>` : 'Salon non configuré'
        },
        {
            key: 'countdown',
            name: 'Compte à Rebours (900)',
            subFeature: 'Jeu du décompte avec pièges aléatoires',
            category: 'Jeux',
            icon: '⏳',
            enabled: !!config.countdown?.enabled,
            viewId: 'game-countdown',
            details: config.countdown?.channel_id
                ? `Départ : ${config.countdown.start_number || 900} | Pièges : ${((config.countdown.trap_chance || 0.15) * 100).toFixed(0)}%`
                : 'Salon non configuré'
        },
        {
            key: 'discord_commands',
            name: 'Commandes Discord',
            subFeature: 'Gestion des permissions et exécution (`/` & `!`)',
            category: 'Commandes',
            icon: '⚡',
            enabled: config.discord?.commands?.enabled !== false,
            viewId: 'commands',
            details: 'Protection & permissions activées'
        },
        {
            key: 'web_auth',
            name: 'Protection API / Web',
            subFeature: 'Sécurisation par clé secrète & IP whitelist',
            category: 'Sécurité',
            icon: '🛡️',
            enabled: !!config.web?.auth?.enabled,
            viewId: 'general-config',
            details: config.web?.auth?.enabled ? 'Authentification requise' : 'Accès ouvert'
        },
        {
            key: 'database',
            name: 'Base de Données (Drizzle ORM)',
            subFeature: 'Couche de données ORM multi-dialectes',
            category: 'Système',
            icon: '🗄️',
            enabled: true,
            viewId: 'general-config',
            details: (config.database_type === 'postgres' || (config.database_url && config.database_url.startsWith('postgres')))
                ? 'Moteur : PostgreSQL (node-postgres)'
                : `Moteur : SQLite (${config.db_path || './data/bot.db'})`
        }
    ];
}

/**
 * Affiche le tableau récapitulatif complet et élégant dans les logs console au démarrage
 */
function printStartupModulesTable() {
    const list = getModulesStatusList();

    const col1W = 34; // Module
    const col2W = 34; // Sous-fonctionnalité
    const col3W = 12; // État

    const pad = (str, len) => {
        const s = String(str || '');
        // Compter les caractères en tenant compte des emojis
        return s.length > len ? s.substring(0, len - 1) + '…' : s.padEnd(len, ' ');
    };

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         📊 ÉTAT DES MODULES DU BOT (config.yml)                       ║');
    console.log('╠════════════════════════════════════╦════════════════════════════════════╦═════════════╣');
    console.log(`║ ${pad('Module', col1W)} ║ ${pad('Sous-fonctionnalité', col2W)} ║ ${pad('État', col3W)} ║`);
    console.log('╠════════════════════════════════════╬════════════════════════════════════╬═════════════╣');

    for (const item of list) {
        const nameDisplay = item.parent ? `  └─ ${item.icon} ${item.name}` : `${item.icon} ${item.name}`;
        const statusDisplay = item.enabled ? '🟢 ACTIF' : '🔴 DÉSACTIVÉ';
        console.log(`║ ${pad(nameDisplay, col1W)} ║ ${pad(item.subFeature, col2W)} ║ ${pad(statusDisplay, col3W)} ║`);
    }

    console.log('╚════════════════════════════════════╩════════════════════════════════════╩═════════════╝');
    console.log('');
}

module.exports = {
    getModulesStatusList,
    printStartupModulesTable
};
