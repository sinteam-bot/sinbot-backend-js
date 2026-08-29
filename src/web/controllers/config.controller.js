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

    // POST /config
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

    return router;
}

module.exports = createConfigRouter;
