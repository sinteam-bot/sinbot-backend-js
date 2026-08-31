/**
 * feature-declarations.js
 *
 * Déclarations centralisées de toutes les features dans le FeatureRegistry.
 * Chargé au démarrage (avant les modules) pour que chaque feature soit connue
 * du registry avant l'enregistrement de ses events/commands.
 *
 * Convention de nommage : <nom_yaml_legacy>
 *   - 'xp' (yaml: xp:)
 *   - 'welcome' (yaml: welcome:)
 *   - 'daily_message' (yaml: daily_message:)
 *   - 'counter' (yaml: counter:)
 *   - 'countdown' (yaml: countdown:)
 *   - 'bump_reminder' (yaml: bump_reminder:)
 *   - 'captcha' (yaml: captcha:)
 *
 * Les features Phase 1+ (automod, tickets, etc.) seront déclarées ici aussi.
 */

const { featureRegistry } = require('../core/feature-registry.js');
const { getConfig } = require('../config/index.js');

function defaultFor(name) {
    const cfg = getConfig();
    if (cfg[name] && typeof cfg[name] === 'object') {
        return { ...cfg[name] };
    }
    if (cfg.features && cfg.features[name] && typeof cfg.features[name] === 'object') {
        return { ...cfg.features[name] };
    }
    return { enabled: false };
}

function declareExistingFeatures() {
    const features = [
        {
            name: 'xp',
            defaults: defaultFor('xp'),
            aliases: ['xp-level', 'xp_level', 'levels', 'leveling'],
            onEnable: async (guildId) => console.log(`✨ [xp] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [xp] disabled on ${guildId}`)
        },
        {
            name: 'welcome',
            defaults: defaultFor('welcome'),
            aliases: ['welcome-messages', 'welcome_messages'],
            onEnable: async (guildId) => console.log(`👋 [welcome] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [welcome] disabled on ${guildId}`)
        },
        {
            name: 'daily_message',
            defaults: defaultFor('daily_message'),
            aliases: ['daily-message', 'daily'],
            onEnable: async (guildId) => console.log(`📅 [daily_message] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [daily_message] disabled on ${guildId}`)
        },
        {
            name: 'counter',
            defaults: defaultFor('counter'),
            aliases: ['game_counter', 'game-counter', 'road-to-infinite', 'road_to_infinite'],
            onEnable: async (guildId) => console.log(`🔢 [counter] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [counter] disabled on ${guildId}`)
        },
        {
            name: 'countdown',
            defaults: defaultFor('countdown'),
            aliases: ['game_countdown', 'game-countdown', 'count-down', 'count_down'],
            onEnable: async (guildId) => console.log(`⏳ [countdown] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [countdown] disabled on ${guildId}`)
        },
        {
            name: 'bump_reminder',
            defaults: defaultFor('bump_reminder'),
            aliases: ['bump-reminder', 'bump_reminders', 'bump'],
            onEnable: async (guildId) => console.log(`⏰ [bump_reminder] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [bump_reminder] disabled on ${guildId}`)
        },
        {
            name: 'captcha',
            defaults: defaultFor('captcha'),
            aliases: ['math_captcha', 'math-captcha'],
            onEnable: async (guildId) => console.log(`🔒 [captcha] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [captcha] disabled on ${guildId}`)
        },
        {
            name: 'cards',
            defaults: defaultFor('cards'),
            aliases: ['welcome_cards', 'welcome-cards'],
            onEnable: async (guildId) => console.log(`🖼️ [cards] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [cards] disabled on ${guildId}`)
        },
        {
            name: 'startup_notifier',
            defaults: defaultFor('startup_notifier'),
            aliases: ['startup-notifier', 'notifier'],
            onEnable: async (guildId) => console.log(`🚀 [startup_notifier] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [startup_notifier] disabled on ${guildId}`)
        }
    ];

    for (const f of features) {
        if (!featureRegistry.features.has(f.name)) {
            featureRegistry.define(f.name, {
                defaults: f.defaults,
                onEnable: f.onEnable,
                onDisable: f.onDisable,
                aliases: f.aliases || []
            });
        }
    }

    console.log(`📚 [feature-declarations] Features de base vérifiées & enregistrées dans le FeatureRegistry.`);
}

module.exports = { declareExistingFeatures };
