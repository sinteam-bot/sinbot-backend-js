/**
 * wsLogsServer.js — WebSocket pour le live feed des logs
 *
 * Branche un endpoint WS sur /ws/logs qui relaie les events
 * 'log.published' du LogsService vers tous les clients connectés.
 * L'authentification est faite via le header x-api-key passé
 * dans le subprotocol (les navigateurs ne permettent pas les
 * headers custom en WS).
 */

function attachLogsWs(httpServer, logsService, authConfig = {}) {
    if (!httpServer || !logsService) return null;
    const { WebSocketServer } = require('ws');
    const wss = new WebSocketServer({ server: httpServer, path: '/ws/logs' });

    const clients = new Set();

    wss.on('connection', (ws, req) => {
        const token = new URL(req.url, 'http://x').searchParams.get('api_key')
            || (req.headers['sec-websocket-protocol'] || '').split(',')[0].trim();

        if (authConfig.enabled && authConfig.api_key && token !== authConfig.api_key) {
            return ws.close(4401, 'Unauthorized');
        }

        clients.add(ws);
        ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }));

        ws.on('close', () => clients.delete(ws));
        ws.on('error', () => clients.delete(ws));
    });

    const onLog = (entry) => {
        const payload = JSON.stringify({ type: 'log', entry });
        for (const ws of clients) {
            if (ws.readyState === 1) {
                try { ws.send(payload); } catch {}
            }
        }
    };
    logsService.on('log.published', onLog);

    wss.on('close', () => logsService.off('log.published', onLog));

    return wss;
}

module.exports = { attachLogsWs };
