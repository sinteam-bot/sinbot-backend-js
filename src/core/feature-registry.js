/**
 * FeatureRegistry — registre central de features
 *
 * Permet d'activer / désactiver des features par guild, avec config et permissions
 * dédiés, en s'appuyant sur la table `feature_flags` (priorité haute) puis
 * sur la config YAML (fallback) puis sur les defaults du code.
 *
 * Usage :
 *   const { featureRegistry } = require('../core/feature-registry');
 *
 *   // Déclarer une feature (à faire au chargement du module)
 *   featureRegistry.define('automod', {
 *     defaults: { enabled: false, spam: { max_messages: 5 } },
 *     onEnable: async (guildId) => { ... },
 *     onDisable: async (guildId) => { ... }
 *   });
 *
 *   // Lire l'état pour un guild
 *   const state = await featureRegistry.get(guildId, 'automod');
 *
 *   // Activer / désactiver
 *   await featureRegistry.set(guildId, 'automod', { enabled: true });
 *
 *   // Vérifier l'accès d'un utilisateur
 *   const access = await featureRegistry.canUse(guildId, userId, 'automod');
 */

const { db, schema } = require('../db/index.js');
const { and, eq } = require('drizzle-orm');
const { getConfig } = require('../config/index.js');
const { eventBus } = require('./event-bus.js');

class FeatureRegistry {
    constructor() {
        this.features = new Map();
        this._dbAvailable = true;
    }

    /**
     * Déclare une feature dans le registre
     * @param {string} name
     * @param {{
     *   defaults?: object,
     *   configSchema?: object,
     *   onEnable?: (guildId: string) => Promise<void>,
     *   onDisable?: (guildId: string) => Promise<void>,
     *   requires?: string[]
     * }} definition
     */
    define(name, definition = {}) {
        this.features.set(name, {
            defaults: definition.defaults || { enabled: false },
            configSchema: definition.configSchema || null,
            onEnable: definition.onEnable || null,
            onDisable: definition.onDisable || null,
            requires: definition.requires || []
        });
        console.log(`📌 [FeatureRegistry] Feature déclarée: ${name}`);
    }

    /**
     * Liste toutes les features déclarées
     */
    list() {
        return Array.from(this.features.entries()).map(([name, def]) => ({
            name,
            defaults: def.defaults
        }));
    }

    /**
     * Récupère l'état complet d'une feature pour un guild.
     * Ordre de priorité : DB > YAML (features.*) > YAML legacy > defaults
     */
    async get(guildId, name) {
        const def = this.features.get(name);
        const defaults = def?.defaults || { enabled: false };

        if (!guildId) {
            return { ...defaults, allowedRoles: [], source: 'default' };
        }

        if (this._dbAvailable) {
            try {
                const rows = await db.select()
                    .from(schema.featureFlags)
                    .where(and(
                        eq(schema.featureFlags.guildId, guildId),
                        eq(schema.featureFlags.featureName, name)
                    ))
                    .limit(1);

                if (rows[0]) {
                    let config = {};
                    let allowedRoles = [];
                    try { config = JSON.parse(rows[0].configJson || '{}'); } catch { config = {}; }
                    try { allowedRoles = JSON.parse(rows[0].allowedRoles || '[]'); } catch { allowedRoles = []; }
                    return {
                        enabled: !!rows[0].enabled,
                        config: { ...defaults, ...config },
                        allowedRoles,
                        source: 'db'
                    };
                }
            } catch (err) {
                this._dbAvailable = false;
                console.warn(`⚠️ [FeatureRegistry] DB indisponible, fallback YAML pour "${name}": ${err.message}`);
            }
        }

        const yamlConfig = getConfig();
        const featuresSection = yamlConfig.features || {};
        if (featuresSection[name] !== undefined) {
            return {
                enabled: !!featuresSection[name].enabled,
                config: { ...defaults, ...featuresSection[name] },
                allowedRoles: featuresSection[name].allowed_roles || [],
                source: 'yaml:features'
            };
        }

        if (yamlConfig[name] !== undefined) {
            return {
                enabled: !!yamlConfig[name].enabled,
                config: { ...defaults, ...yamlConfig[name] },
                allowedRoles: yamlConfig[name].allowed_roles || [],
                source: 'yaml:legacy'
            };
        }

        return {
            enabled: !!defaults.enabled,
            config: { ...defaults },
            allowedRoles: defaults.allowed_roles || [],
            source: 'default'
        };
    }

    /**
     * Met à jour l'état d'une feature (upsert en DB)
     */
    async set(guildId, name, { enabled, config, allowedRoles, updatedBy } = {}) {
        if (!guildId) throw new Error('guildId requis');
        if (!this.features.has(name)) {
            throw new Error(`Feature inconnue: "${name}"`);
        }

        const def = this.features.get(name);
        const existing = await this.get(guildId, name);
        const newEnabled = enabled !== undefined ? !!enabled : !!existing.enabled;
        const newConfig = config !== undefined ? config : existing.config;
        const newAllowedRoles = allowedRoles !== undefined ? allowedRoles : existing.allowedRoles;
        const now = Date.now();

        if (this._dbAvailable) {
            try {
                const existingRow = await db.select()
                    .from(schema.featureFlags)
                    .where(and(
                        eq(schema.featureFlags.guildId, guildId),
                        eq(schema.featureFlags.featureName, name)
                    ))
                    .limit(1);

                if (existingRow[0]) {
                    await db.update(schema.featureFlags)
                        .set({
                            enabled: newEnabled ? 1 : 0,
                            configJson: JSON.stringify(newConfig),
                            allowedRoles: JSON.stringify(newAllowedRoles),
                            updatedBy: updatedBy || null,
                            updatedAt: now
                        })
                        .where(and(
                            eq(schema.featureFlags.guildId, guildId),
                            eq(schema.featureFlags.featureName, name)
                        ));
                } else {
                    await db.insert(schema.featureFlags)
                        .values({
                            guildId,
                            featureName: name,
                            enabled: newEnabled ? 1 : 0,
                            configJson: JSON.stringify(newConfig),
                            allowedRoles: JSON.stringify(newAllowedRoles),
                            updatedBy: updatedBy || null,
                            updatedAt: now
                        });
                }
            } catch (err) {
                this._dbAvailable = false;
                throw new Error(`Impossible d'écrire en DB: ${err.message}`);
            }
        }

        if (newEnabled && def.onEnable) {
            try { await def.onEnable(guildId); } catch (e) { console.error(`[FeatureRegistry] onEnable(${name}) error:`, e.message); }
        }
        if (!newEnabled && def.onDisable) {
            try { await def.onDisable(guildId); } catch (e) { console.error(`[FeatureRegistry] onDisable(${name}) error:`, e.message); }
        }

        try {
            eventBus.emit('feature.updated', { guildId, name, enabled: newEnabled });
        } catch {}

        return {
            enabled: newEnabled,
            config: newConfig,
            allowedRoles: newAllowedRoles,
            source: 'db'
        };
    }

    /**
     * Liste les features avec leur état pour un guild
     */
    async listForGuild(guildId) {
        const features = this.list();
        return Promise.all(features.map(async (f) => {
            const state = await this.get(guildId, f.name);
            return {
                name: f.name,
                defaults: f.defaults,
                state
            };
        }));
    }

    /**
     * Vérifie si un utilisateur peut utiliser une feature
     * @returns {{ allowed: boolean, reason: string }}
     */
    async canUse(guildId, userId, name) {
        const state = await this.get(guildId, name);
        if (!state.enabled) return { allowed: false, reason: 'disabled' };

        const roles = state.allowedRoles || [];
        if (!roles || roles.length === 0) {
            return { allowed: true, reason: 'no_restriction' };
        }

        try {
            const { getConfig } = require('../config/index.js');
            const guildIdEnv = getConfig().discord?.guild_id || process.env.GUILD_ID;
            if (!guildIdEnv) return { allowed: true, reason: 'no_guild_context' };

            const { container } = require('./container.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (!client) return { allowed: true, reason: 'no_client_context' };

            const guild = await client.guilds.fetch(guildId).catch(() => null) || await client.guilds.fetch(guildIdEnv).catch(() => null);
            if (!guild) return { allowed: true, reason: 'guild_not_found' };

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return { allowed: false, reason: 'not_member' };

            const hasRole = roles.some(roleId => member.roles.cache.has(roleId));
            if (!hasRole) return { allowed: false, reason: 'missing_role' };

            return { allowed: true, reason: 'role_match' };
        } catch (err) {
            console.warn(`[FeatureRegistry] canUse check failed for ${name}: ${err.message}`);
            return { allowed: true, reason: 'check_error' };
        }
    }

    /**
     * Vide le cache (utile pour les tests)
     */
    _reset() {
        this.features.clear();
        this._dbAvailable = true;
    }
}

const featureRegistry = new FeatureRegistry();

module.exports = { FeatureRegistry, featureRegistry };
