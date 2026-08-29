/**
 * src/web/controllers/events.controller.js
 *
 * Archive et historique des événements Discord.
 */

const express = require('express');
const logger = require('../../utils/logger.js');
const { AuditRepository } = require('../../db/schemas/shared/audit.repository.js');

function createEventsRouter() {
    const router = express.Router();
    const auditRepo = new AuditRepository();

    // GET /events/archive
    router.get('/archive', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const offset = parseInt(req.query.offset) || 0;
            const eventName = req.query.eventName || null;
            const category = req.query.category || null;
            const search = req.query.search || null;

            const data = await auditRepo.getDiscordEventsArchive({ limit, offset, eventName, category, search });
            res.json({
                success: true,
                data
            });
        } catch (error) {
            logger.error(`Erreur GET /api/events/archive: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createEventsRouter;
