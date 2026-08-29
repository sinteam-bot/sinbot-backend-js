/**
 * src/web/controllers/daily-messages.controller.js
 *
 * Pont / Routeur pour les routes /daily-messages (dashboard web).
 */

const express = require('express');
const { container } = require('../../core/container.js');
const { DailyMessageController } = require('../../modules/community_daily-message/daily-message.controller.js');
const { createRateLimiters } = require('../../utils/security.js');

function createDailyMessagesRouter(client) {
    const router = express.Router();
    const rateLimiters = createRateLimiters();

    const getController = () => container.resolve(DailyMessageController);

    // GET /daily-messages
    router.get('/', async (req, res) => {
        const controller = getController();
        const result = await controller.getStatus(req);
        res.json(result);
    });

    const handleGenerate = async (req, res) => {
        const controller = getController();
        const result = await controller.generateDraft(req);
        res.json(result);
    };

    router.post('/generate-test', rateLimiters.aiGeneration, handleGenerate);
    router.post('/generate-preview', rateLimiters.aiGeneration, handleGenerate);
    router.post('/generate', rateLimiters.aiGeneration, handleGenerate);

    router.post('/accept', async (req, res) => {
        const controller = getController();
        const result = await controller.acceptDraft(req);
        res.json(result);
    });

    router.post('/reject', async (req, res) => {
        const controller = getController();
        const result = await controller.rejectDraft(req);
        res.json(result);
    });

    router.post('/regenerate', async (req, res) => {
        const controller = getController();
        const result = await controller.regenerateDraft(req);
        res.json(result);
    });

    const handlePublish = async (req, res) => {
        const controller = getController();
        req.client = client;
        req.app = req.app || {};
        req.app.get = (k) => k === 'discordClient' ? client : null;
        const result = await controller.publishNow(req);
        res.json(result);
    };

    router.post('/publish-now', handlePublish);
    router.post('/publish', handlePublish);

    return router;
}

module.exports = createDailyMessagesRouter;
