/**
 * src/web/controllers/captcha.controller.js
 *
 * Pont / Routeur pour les routes /captcha-logs (dashboard web).
 */

const express = require('express');
const logger = require('../../utils/logger.js');
const { container } = require('../../core/container.js');
const { CaptchaService } = require('../../modules/security_captcha/captcha.service.js');

function createCaptchaRouter() {
    const router = express.Router();

    const getService = () => container.resolve(CaptchaService);

    // GET /captcha-logs
    router.get('/captcha-logs', async (req, res) => {
        try {
            const service = getService();
            const overview = await service.getCaptchaOverview();
            res.json({
                success: true,
                data: overview
            });
        } catch (error) {
            logger.error(`Erreur GET /api/captcha-logs: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /captcha-logs/messages, /captcha-logs/:channelId/messages, /captcha/messages
    router.get(['/captcha-logs/messages', '/captcha-logs/:channelId/messages', '/captcha/messages'], async (req, res) => {
        try {
            const service = getService();
            const channelId = req.params?.channelId || req.query?.channel_id || req.query?.channelId;
            const userId = req.query?.user_id || req.query?.userId;
            const guildId = req.query?.guild_id || req.query?.guildId;

            const history = await service.getChannelHistory(channelId, userId, guildId);
            res.json({
                success: true,
                data: history
            });
        } catch (error) {
            logger.error(`Erreur GET /api/captcha-logs/messages: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createCaptchaRouter;
