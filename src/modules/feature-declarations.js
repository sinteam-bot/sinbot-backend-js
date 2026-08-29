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
    if (featureRegistry.list().length > 0) {
        return;
    }

    const features = [
        {
            name: 'xp',
            defaults: defaultFor('xp'),
            onEnable: async (guildId) => console.log(`✨ [xp] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [xp] disabled on ${guildId}`)
        },
        {
            name: 'welcome',
            defaults: defaultFor('welcome'),
            onEnable: async (guildId) => console.log(`👋 [welcome] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [welcome] disabled on ${guildId}`)
        },
        {
            name: 'daily_message',
            defaults: defaultFor('daily_message'),
            onEnable: async (guildId) => console.log(`📅 [daily_message] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [daily_message] disabled on ${guildId}`)
        },
        {
            name: 'counter',
            defaults: defaultFor('counter'),
            onEnable: async (guildId) => console.log(`🔢 [counter] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [counter] disabled on ${guildId}`)
        },
        {
            name: 'countdown',
            defaults: defaultFor('countdown'),
            onEnable: async (guildId) => console.log(`⏳ [countdown] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [countdown] disabled on ${guildId}`)
        },
        {
            name: 'bump_reminder',
            defaults: defaultFor('bump_reminder'),
            onEnable: async (guildId) => console.log(`⏰ [bump_reminder] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [bump_reminder] disabled on ${guildId}`)
        },
        {
            name: 'captcha',
            defaults: defaultFor('captcha'),
            onEnable: async (guildId) => console.log(`🔒 [captcha] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [captcha] disabled on ${guildId}`)
        },
        {
            name: 'welcome',
            defaults: defaultFor('welcome'),
            onEnable: async (guildId) => console.log(`👋 [welcome] enabled on ${guildId}`),
            onDisable: async (guildId) => console.log(`💤 [welcome] disabled on ${guildId}`)
        }
    ];

    for (const f of features) {
        featureRegistry.define(f.name, {
            defaults: f.defaults,
            onEnable: f.onEnable,
            onDisable: f.onDisable,
            aliases: f.aliases || []
        });
    }

    console.log(`📚 [feature-declarations] ${features.length} features déclarées dans le registry.`);
}

module.exports = { declareExistingFeatures };
