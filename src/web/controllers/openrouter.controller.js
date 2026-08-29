/**
 * src/web/controllers/openrouter.controller.js
 *
 * Contrôleur OpenRouter : modèles dynamiques et politique de retry (Polly-like).
 */

const express = require('express');
const logger = require('../../utils/logger.js');

function createOpenRouterRouter() {
    const router = express.Router();

    // GET /openrouter/models
    router.get('/models', async (req, res) => {
        try {
            const { getOpenRouterModelsList } = require('../../utils/openrouter.js');
            const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
            const models = await getOpenRouterModelsList(forceRefresh);
            res.json({
                success: true,
                count: models.length,
                data: models
            });
        } catch (error) {
            logger.error(`Erreur GET /api/openrouter/models: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /openrouter/config
    router.get('/config', async (req, res) => {
        try {
            const { getConfig, config } = require('../../config/index.js');
            const { getFallbackModelsFromConfig } = require('../../utils/openrouter.js');
            const currentConfig = getConfig ? getConfig() : config;
            const openrouterConfig = currentConfig.openrouter || {};
            res.json({
                success: true,
                data: {
                    default_model: openrouterConfig.default_model || 'openai/gpt-oss-20b:free',
                    fallback_models: getFallbackModelsFromConfig(),
                    retry_policy: openrouterConfig.retry_policy || {
                        enabled: true,
                        max_retries: 3,
                        initial_delay_ms: 1000,
                        backoff_factor: 2.0,
                        max_delay_ms: 8000,
                        jitter: true,
                        timeout_ms: 25000,
                        retryable_statuses: [408, 429, 500, 502, 503, 504]
                    }
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/openrouter/config: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /openrouter/config
    router.post('/config', async (req, res) => {
        try {
            const { saveConfig, getConfig, config } = require('../../config/index.js');
            const currentConfig = getConfig ? getConfig() : config;
            if (!currentConfig.openrouter) currentConfig.openrouter = {};

            if (req.body.default_model !== undefined) {
                currentConfig.openrouter.default_model = req.body.default_model;
            }
            if (Array.isArray(req.body.fallback_models)) {
                currentConfig.openrouter.fallback_models = req.body.fallback_models;
            }
            if (req.body.retry_policy && typeof req.body.retry_policy === 'object') {
                currentConfig.openrouter.retry_policy = {
                    ...currentConfig.openrouter.retry_policy,
                    ...req.body.retry_policy
                };
            }

            saveConfig(currentConfig);
            res.json({
                success: true,
                message: 'Configuration OpenRouter & Polly Retry mise à jour avec succès !',
                data: currentConfig.openrouter
            });
        } catch (error) {
            logger.error(`Erreur POST /api/openrouter/config: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createOpenRouterRouter;
