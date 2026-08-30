/**
 * src/web/controllers/config.controller.js
 *
 * Configuration globale du bot, des modules et statut des fonctionnalités.
 */

const express = require('express');
const logger = require('../../utils/logger.js');
const { createRateLimiters, requireRole } = require('../../utils/security.js');

function createConfigRouter() {
    const router = express.Router();
    const rateLimiters = createRateLimiters();

    // GET /modules/status
    router.get('/modules/status', (req, res) => {
        try {
            const { getModulesStatusList } = require('../../utils/modulesSummary.js');
            res.json({
                success: true,
                data: getModulesStatusList()
            });
        } catch (error) {
            logger.error(`Erreur GET /api/modules/status: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /config
    router.get('/config', async (req, res) => {
        try {
            const { getConfig } = require('../../config/index.js');
            const { getModulesStatusList } = require('../../utils/modulesSummary.js');
            const fullConfig = getConfig();

            res.json({
                success: true,
                data: {
                    modules: getModulesStatusList(),
                    welcome: fullConfig.welcome || {},
                    captcha: fullConfig.captcha || {},
                    xp: fullConfig.welcome?.xp || fullConfig.xp || {},
                    daily_message: fullConfig.daily_message || {},
                    startup_notifier: fullConfig.startup_notifier || {},
                    counter: fullConfig.counter || {},
                    countdown: fullConfig.countdown || {},
                    web: fullConfig.web || {},
                    scheduler: fullConfig.scheduler || {},
                    commands: fullConfig.discord?.commands || {},
                    discord: {
                        client_id: fullConfig.discord?.client_id || process.env.CLIENT_ID || '',
                        guild_id: fullConfig.discord?.guild_id || process.env.GUILD_ID || '',
                        default_color: fullConfig.discord?.default_color || process.env.BOT_COLOR || '#f2c7ce',
                        commands: fullConfig.discord?.commands || {}
                    },
                    env: {
                        dailyMessageChannelId: fullConfig.daily_message?.channel_id || process.env.DAILY_MESSAGE_CHANNEL_ID || '',
                        notificationChannelId: fullConfig.startup_notifier?.channel_id || process.env.LOG_CHANNEL_ID || '',
                        openrouterModel: fullConfig.openrouter?.default_model || fullConfig.daily_message?.ai_config?.model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free'
                    },
                    fullConfig
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/config: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /config (legacy global config)
    router.post('/config', rateLimiters.sensitive, requireRole('admin'), async (req, res) => {
        const { module, config: moduleConfig } = req.body;

        if (!module || !moduleConfig) {
            return res.status(400).json({ success: false, error: 'Module et configuration requis' });
        }

        try {
            const { getConfig, saveModuleConfig } = require('../../config/index.js');
            if (module === 'commands') {
                const conf = getConfig();
                conf.discord = conf.discord || {};
                conf.discord.commands = moduleConfig;
                saveModuleConfig('discord', conf.discord);
            } else {
                saveModuleConfig(module, moduleConfig);
            }
            logger.info(`Configuration du module ${module} mise à jour avec succès dans config.yml`, 'CONFIG');

            res.json({ success: true, message: `Configuration du module ${module} sauvegardée avec succès dans config.yml !` });
        } catch (error) {
            logger.error(`Erreur POST /api/config (${module}): ${error.message}`, 'CONFIG');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    function normalizeFeature(name) {
        if (!name) return name;
        let n = String(name).replace(/-/g, '_').toLowerCase();
        if (n === 'security_question') n = 'captcha';
        if (n === 'xp_level') n = 'xp';
        return n;
    }

    // =========================================================================
    // ROUTES MULTI-NIVEAUX C12 : /api/config/:guildId/:feature
    // Lecture : data/example/{f} -> data/default/{f} -> data/{guildId}/{f}
    // Écriture : data/{guildId}/{f}.config.yml
    // =========================================================================

    // GET /config/:guildId/:feature
    router.get('/config/:guildId/:feature', async (req, res) => {
        try {
            const { guildId, feature: rawFeature } = req.params;
            const feature = normalizeFeature(rawFeature);

            if (!guildId || !feature) {
                return res.status(400).json({ success: false, error: 'guildId et feature requis' });
            }

            const { getFeatureConfig } = require('../../config/c12-loader.js');
            const data = await getFeatureConfig(guildId, feature);

            res.json({
                success: true,
                guildId,
                feature,
                data
            });
        } catch (error) {
            logger.error(`Erreur GET /api/config/${req.params.guildId}/${req.params.feature}: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Handler d'écriture (PATCH / POST / PUT /config/:guildId/:feature)
    const handleFeatureConfigSave = async (req, res) => {
        try {
            const { guildId, feature: rawFeature } = req.params;
            const feature = normalizeFeature(rawFeature);

            if (!guildId || !feature) {
                return res.status(400).json({ success: false, error: 'guildId et feature requis' });
            }

            const { setFeatureConfig } = require('../../config/c12-loader.js');
            const { featureRegistry } = require('../../core/feature-registry.js');

            const body = req.body || {};
            const patch = body.config && typeof body.config === 'object' && !Array.isArray(body.config)
                ? { ...(body.enabled !== undefined ? { enabled: body.enabled } : {}), ...body.config }
                : body;

            // 1. Écriture atomique dans data/{guildId}/{feature}.config.yml
            const updated = await setFeatureConfig(guildId, feature, patch);

            // 2. Synchronisation FeatureRegistry si déclaré (pour hooks onEnable/onDisable)
            if (featureRegistry && featureRegistry.features && (featureRegistry.features.has(feature) || featureRegistry._aliases.has(feature))) {
                try {
                    await featureRegistry.set(guildId, feature, {
                        enabled: patch.enabled !== undefined ? patch.enabled : updated.enabled,
                        config: updated,
                        allowedRoles: patch.allowed_roles || updated.allowed_roles,
                        updatedBy: req.user?.id || req.body?.updatedBy
                    });
                } catch (e) {
                    // FeatureRegistry notification hook
                }
            }

            logger.info(`[Config] Feature "${feature}" mise à jour pour le serveur "${guildId}" (data/${guildId}/${feature}.config.yml)`, 'CONFIG');

            res.json({
                success: true,
                guildId,
                feature,
                data: updated,
                message: `Configuration "${feature}" enregistrée avec succès dans data/${guildId}/${feature}.config.yml !`
            });
        } catch (error) {
            logger.error(`Erreur mise à jour /api/config/${req.params.guildId}/${req.params.feature}: ${error.message}`, 'CONFIG');
            res.status(500).json({ success: false, error: error.message });
        }
    };

    router.patch('/config/:guildId/:feature', rateLimiters.sensitive, requireRole('admin'), handleFeatureConfigSave);
    router.post('/config/:guildId/:feature', rateLimiters.sensitive, requireRole('admin'), handleFeatureConfigSave);
    router.put('/config/:guildId/:feature', rateLimiters.sensitive, requireRole('admin'), handleFeatureConfigSave);

    // Fallbacks avec guildId optionnel en query string : /api/config/:feature?guild_id=...
    router.get('/config/:feature', async (req, res, next) => {
        // Si la requête est /config/modules/status, laisser passer
        if (req.params.feature === 'modules') return next();
        try {
            const guildId = req.query.guild_id || req.query.guildId || process.env.GUILD_ID || 'default';
            const feature = normalizeFeature(req.params.feature);
            const { getFeatureConfig } = require('../../config/c12-loader.js');
            const data = await getFeatureConfig(guildId, feature);
            res.json({
                success: true,
                guildId,
                feature,
                data
            });
        } catch (error) {
            logger.error(`Erreur GET /api/config/${req.params.feature}: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createConfigRouter;
