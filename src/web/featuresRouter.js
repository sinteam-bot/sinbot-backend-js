/**
 * featuresRouter.js
 *
 * Routes REST pour piloter les features depuis le dashboard web :
 *   GET    /api/features                    : liste toutes les features + état
 *   GET    /api/features/:name              : état détaillé d'une feature
 *   PATCH  /api/features/:name              : maj on/off / config / allowedRoles
 *   POST   /api/features/:name/can-use      : vérifie l'accès d'un utilisateur
 *
 * L'authentification est gérée par le middleware global webAuthMiddleware
 * (header x-api-key, IP allowlist, etc.) défini dans src/index.js.
 *
 * Le guildId est résolu par défaut depuis process.env.GUILD_ID ou depuis
 * le body / query string.
 */

const express = require('express');
const { featureRegistry } = require('../core/feature-registry.js');
const logger = require('../utils/logger.js');

function resolveGuildId(req) {
    return (req.body && req.body.guildId)
        || (req.query && req.query.guild_id)
        || (req.query && req.query.guildId)
        || process.env.GUILD_ID
        || null;
}

function createFeaturesRouter() {
    const router = express.Router();

    router.get('/', async (req, res) => {
        try {
            const guildId = resolveGuildId(req);
            if (!guildId) {
                return res.status(400).json({ success: false, error: 'guildId manquant (header / query / GUILD_ID env)' });
            }
            const features = await featureRegistry.listForGuild(guildId);
            res.json({ success: true, data: features, guildId });
        } catch (err) {
            logger.error(`GET /api/features: ${err.message}`, 'WEB');
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/:name', async (req, res) => {
        try {
            const guildId = resolveGuildId(req);
            if (!guildId) return res.status(400).json({ success: false, error: 'guildId manquant' });
            const state = await featureRegistry.get(guildId, req.params.name);
            res.json({ success: true, data: { name: req.params.name, ...state } });
        } catch (err) {
            logger.error(`GET /api/features/${req.params.name}: ${err.message}`, 'WEB');
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.patch('/:name', async (req, res) => {
        try {
            const guildId = resolveGuildId(req);
            if (!guildId) return res.status(400).json({ success: false, error: 'guildId manquant' });
            const { enabled, config, allowedRoles, updatedBy } = req.body || {};
            const result = await featureRegistry.set(guildId, req.params.name, {
                enabled,
                config,
                allowedRoles,
                updatedBy
            });
            res.json({ success: true, data: { name: req.params.name, ...result } });
        } catch (err) {
            logger.error(`PATCH /api/features/${req.params.name}: ${err.message}`, 'WEB');
            if (err.message.includes('Feature inconnue')) {
                return res.status(404).json({ success: false, error: err.message });
            }
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/:name/can-use', async (req, res) => {
        try {
            const guildId = (req.body && req.body.guildId) || process.env.GUILD_ID;
            const userId = req.body && req.body.userId;
            if (!guildId || !userId) {
                return res.status(400).json({ success: false, error: 'guildId et userId requis' });
            }
            const access = await featureRegistry.canUse(guildId, userId, req.params.name);
            res.json({ success: true, data: { name: req.params.name, ...access } });
        } catch (err) {
            logger.error(`POST /api/features/${req.params.name}/can-use: ${err.message}`, 'WEB');
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = createFeaturesRouter;
