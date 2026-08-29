/**
 * src/web/controllers/bump.controller.js
 *
 * Pont / Routeur pour les routes /bump (dashboard web).
 */

const express = require('express');
const logger = require('../../utils/logger.js');
const { container } = require('../../core/container.js');
const { BumpReminderService } = require('../../modules/util_bump-reminder/bump-reminder.service.js');
const { BumpReminderController } = require('../../modules/util_bump-reminder/bump-reminder.controller.js');

function createBumpRouter(client) {
    const router = express.Router();

    const getService = () => container.resolve(BumpReminderService);
    const getController = () => container.resolve(BumpReminderController);

    // GET /bump, /bump/status
    router.get(['/', '/status'], async (req, res) => {
        try {
            const service = getService();
            const status = await service.getBumpStatus();
            res.json({ success: true, data: status });
        } catch (error) {
            logger.error(`Erreur GET /api/bump: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /bump/config
    router.post('/config', async (req, res) => {
        try {
            const controller = getController();
            const result = await controller.saveConfig(req);
            res.json(result);
        } catch (error) {
            logger.error(`Erreur POST /api/bump/config: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /bump/test-reminder
    router.post('/test-reminder', async (req, res) => {
        try {
            const controller = getController();
            req.app = req.app || {};
            req.app.get = () => client;
            const result = await controller.remindNow(req);
            res.json(result);
        } catch (error) {
            logger.error(`Erreur POST /api/bump/test-reminder: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /bump/cleanup-tests
    router.post('/cleanup-tests', async (req, res) => {
        try {
            const controller = getController();
            const result = await controller.cleanupTests(req);
            res.json(result);
        } catch (error) {
            logger.error(`Erreur POST /api/bump/cleanup-tests: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /bump/delete-log
    router.post('/delete-log', async (req, res) => {
        try {
            const controller = getController();
            const result = await controller.deleteLog(req);
            res.json(result);
        } catch (error) {
            logger.error(`Erreur POST /api/bump/delete-log: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createBumpRouter;
