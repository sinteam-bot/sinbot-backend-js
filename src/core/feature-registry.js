/**
 * FeatureRegistry — registre central de features
 *
 * Permet d'activer / désactiver des features par guild, avec config et permissions
 * dédiés, en s'appuyant sur c12 (https://github.com/unjs/c12) pour la persistance
 * fichier (data/{guildId}/<feature>.config.yml) avec hot reload.
 *
 * Plus de table DB `feature_flags` : tout est en fichiers YAML versionnés/gitignorés
 * selon les conventions définies dans docs/plan/migrate-to-c12.md.
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
 *
 * Phase 6 du plan migrate-to-c12.md.
 */

const { getFeatureConfig, setFeatureConfig, watchFeatureConfig, unwatchFeatureConfig } =
    require('../config/c12-loader.js');
const { eventBus } = require('./event-bus.js');
const { getConfig } = require('../config/index.js');

class FeatureRegistry {
    constructor() {
        this.features = new Map();
        // Aliases : noms acceptés vers le nom canonique déclaré.
        this._aliases = new Map();
    }

    /**
     * Déclare une feature dans le registre (en mémoire seulement).
     * La persistance est gérée par c12 (fichiers).
     */
    define(name, definition = {}) {
        this.features.set(name, {
            defaults: definition.defaults || { enabled: false },
            configSchema: definition.configSchema || null,
            onEnable: definition.onEnable || null,
            onDisable: definition.onDisable || null,
            requires: definition.requires || []
        });
        for (const alias of (definition.aliases || [])) {
            this._aliases.set(alias, name);
        }
        console.log(`📌 [FeatureRegistry] Feature déclarée: ${name}`);
    }

    /**
     * Résout un nom de feature (potentiellement alias) vers le nom canonique.
     */
    _resolveName(name) {
        const resolved = this._aliases.get(name) || name;
        if (resolved !== name) {
            console.log(`🔁 [FeatureRegistry] Alias résolu: '${name}' → '${resolved}'`);
        }
        return resolved;
    }

    /**
     * Liste toutes les features déclarées.
     */
    list() {
        return Array.from(this.features.entries()).map(([name, def]) => ({
            name,
            defaults: def.defaults
        }));
    }

    /**
     * Récupère l'état complet d'une feature pour un guild.
     * Source unique : c12 (cascade example → default → guild).
     */
    async get(guildId, name) {
        name = this._resolveName(name);
        const def = this.features.get(name);
        const defaults = def?.defaults || { enabled: false };

        // Si la feature n'est même pas déclarée, on retourne direct les
        // defaults (pas d'appel c12, car aucun fichier n'existera pour elle).
        if (!def) {
            return {
                enabled: !!defaults.enabled,
                config: { ...defaults },
                allowedRoles: defaults.allowed_roles || [],
                source: 'default'
            };
        }

        if (!guildId) {
            return {
                enabled: !!defaults.enabled,
                config: { ...defaults },
                allowedRoles: defaults.allowed_roles || [],
                source: 'default'
            };
        }

        try {
            const merged = await getFeatureConfig(guildId, name);
            return {
                enabled: merged.enabled !== undefined ? !!merged.enabled : !!defaults.enabled,
                config: { ...defaults, ...merged },
                allowedRoles: merged.allowed_roles || defaults.allowed_roles || [],
                source: 'file'
            };
        } catch (err) {
            console.warn(`⚠️ [FeatureRegistry] Erreur lecture c12 pour "${name}" (guild ${guildId}): ${err.message}`);
            return {
                enabled: !!defaults.enabled,
                config: { ...defaults },
                allowedRoles: defaults.allowed_roles || [],
                source: 'default'
            };
        }
    }

    /**
     * Met à jour l'état d'une feature (écrit dans le YAML via c12).
     */
    async set(guildId, name, { enabled, config, allowedRoles, updatedBy } = {}) {
        name = this._resolveName(name);
        if (!guildId) throw new Error('guildId requis');
        if (!this.features.has(name)) {
            throw new Error(`Feature inconnue: "${name}"`);
        }

        const existing = await this.get(guildId, name);
        const newEnabled = enabled !== undefined ? !!enabled : !!existing.enabled;
        // On retire 'enabled' du config existant pour éviter de l'écraser
        // avec la valeur stale lors du spread ci-dessous.
        const existingConfigNoEnabled = { ...existing.config };
        delete existingConfigNoEnabled.enabled;
        const newConfig = config !== undefined
            ? { ...existingConfigNoEnabled, ...config }
            : existing.config;
        const newAllowedRoles = allowedRoles !== undefined ? allowedRoles : existing.allowedRoles;

        // Patch à appliquer (c12 merge)
        const patch = {
            enabled: newEnabled,
            ...newConfig,
            allowed_roles: newAllowedRoles
        };

        // c12 écrit dans data/{guildId}/{name}.config.yml
        try {
            await setFeatureConfig(guildId, name, patch);
        } catch (err) {
            throw new Error(`Impossible d'écrire le fichier config: ${err.message}`);
        }

        // Hooks onEnable / onDisable
        const def = this.features.get(name);
        if (newEnabled && def.onEnable) {
            try { await def.onEnable(guildId); } catch (e) {
                console.error(`[FeatureRegistry] onEnable(${name}) error:`, e.message);
            }
        }
        if (!newEnabled && def.onDisable) {
            try { await def.onDisable(guildId); } catch (e) {
                console.error(`[FeatureRegistry] onDisable(${name}) error:`, e.message);
            }
        }

        // Émettre l'event pour les listeners (déjà fait par setFeatureConfig,
        // mais on le ré-émet ici pour la rétrocompat)
        try {
            eventBus.emit('feature.updated', { guildId, name, enabled: newEnabled, updatedBy });
        } catch (err) {
            console.warn(`[FeatureRegistry] Erreur émission event 'feature.updated':`, err.message);
        }

        return {
            enabled: newEnabled,
            config: newConfig,
            allowedRoles: newAllowedRoles,
            source: 'file'
        };
    }

    /**
     * Liste les features avec leur état pour un guild.
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
     * Active le hot reload sur une feature (dev only, no-op en prod).
     */
    watchFeature(guildId, name) {
        return watchFeatureConfig(guildId, name);
    }

    unwatchFeature(guildId, name) {
        return unwatchFeatureConfig(guildId, name);
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
        this._aliases.clear();
    }
}

const featureRegistry = new FeatureRegistry();

module.exports = { FeatureRegistry, featureRegistry };
