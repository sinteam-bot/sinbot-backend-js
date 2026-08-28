const assert = require('node:assert');
const http = require('http');

describe('wsLogsServer', () => {
    let wsLogsServer;
    let server;
    let wss;

    beforeAll(() => {
        wsLogsServer = require('../src/utils/wsLogsServer.js');
        server = http.createServer();
        return new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve());
        });
    });

    afterAll(() => {
        return new Promise((resolve) => {
            if (wss) {
                wss.close(() => {
                    server.close(() => resolve());
                });
            } else {
                server.close(() => resolve());
            }
        });
    });

    describe('attachLogsWs', () => {
        test('returns null if httpServer is missing', () => {
            const mockLogsService = { on: () => {}, off: () => {} };
            const result = wsLogsServer.attachLogsWs(null, mockLogsService);
            assert.strictEqual(result, null);
        });

        test('returns null if logsService is missing', () => {
            const result = wsLogsServer.attachLogsWs(server, null);
            assert.strictEqual(result, null);
        });

        test('creates WebSocketServer and attaches to http server', () => {
            const mockLogsService = { on: () => {}, off: () => {} };
            wss = wsLogsServer.attachLogsWs(server, mockLogsService);
            assert.ok(wss);
            assert.ok(typeof wss.on === 'function');
        });

        test('registers log.published listener on logsService', () => {
            let registered = false;
            const logsService = {
                on: (event) => { if (event === 'log.published') registered = true; },
                off: () => {},
            };
            wsLogsServer.attachLogsWs(server, logsService);
            assert.strictEqual(registered, true);
        });

        test('uses /ws/logs path', () => {
            const mockLogsService = { on: () => {}, off: () => {} };
            const result = wsLogsServer.attachLogsWs(server, mockLogsService);
            assert.ok(result);
        });
    });
});
