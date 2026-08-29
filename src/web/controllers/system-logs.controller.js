/**
 * src/web/controllers/system-logs.controller.js
 *
 * Logs système Winston/console et Server-Sent Events (SSE).
 */

const express = require('express');
const logger = require('../../utils/logger.js');

function createSystemLogsRouter() {
    const router = express.Router();

    // Logs système/console (Winston / File Logger)
    router.get('/logs/system', (req, res) => {
        try {
            const { level, category, search, limit, since } = req.query;
            const logs = logger.getLogs({ level, category, search, limit, since });
            res.json({
                success: true,
                data: logs,
                total: logs.length
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Intercepteur GET /logs pour requêtes logs applicatifs/système
    router.get('/logs', (req, res, next) => {
        if (req.query.level !== undefined || req.query.category !== undefined || req.query.since !== undefined || req.query.system === 'true') {
            try {
                const { level, category, search, limit, since } = req.query;
                const logs = logger.getLogs({ level, category, search, limit, since });
                return res.json({
                    success: true,
                    data: logs,
                    total: logs.length
                });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }
        }
        // Sinon déléguer au LogsController de sécurité / BDD
        next();
    });

    // Server-Sent Events (SSE) pour le flux de logs en direct
    router.get('/logs/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const sendEvent = (event, data) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        // Envoyer un message de bienvenue et les 50 derniers logs
        sendEvent('connected', { timestamp: new Date().toISOString() });
        const recent = logger.getLogs({ limit: 50 });
        recent.forEach(log => sendEvent('log', log));

        // Écouteur pour les nouveaux logs
        const onNewLog = (log) => {
            sendEvent('log', log);
        };

        const onClear = () => {
            sendEvent('clear', {});
        };

        logger.on('log', onNewLog);
        logger.on('clear', onClear);

        // Heartbeat pour maintenir la connexion active
        const heartbeat = setInterval(() => {
            sendEvent('ping', { time: Date.now() });
        }, 15000);

        req.on('close', () => {
            clearInterval(heartbeat);
            logger.off('log', onNewLog);
            logger.off('clear', onClear);
        });
    });

    // Vider les logs
    router.delete('/logs', (req, res) => {
        logger.clear();
        res.json({ success: true, message: 'Logs effacés' });
    });

    return router;
}

module.exports = createSystemLogsRouter;
