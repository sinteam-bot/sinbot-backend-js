const assert = require('node:assert');
const { TeamSpeakController } = require('../../src/modules/util_teamspeak/controllers/teamspeak.controller.js');
const { TeamSpeakTreeService } = require('../../src/modules/util_teamspeak/services/teamspeak-tree.service.js');

describe('TeamSpeakController', () => {
    let controller;
    let mockClientService;
    let treeService;
    let mockWidgetService;
    let mockLogsService;

    beforeEach(() => {
        mockClientService = {
            isConnected: () => true,
            getServerInfo: () => ({ name: 'Test TS3', host: 'ts.test.com', port: 9987, maxClients: 32 }),
            _channels: [{ cid: 1, pid: 0, name: 'Lobby' }],
            _clients: [{ clid: 10, cid: 1, nickname: 'Alice', type: 0 }],
            getTreeData: () => ({
                online: true,
                channels: [{ cid: 1, pid: 0, name: 'Lobby' }],
                clients: [{ clid: 10, cid: 1, nickname: 'Alice', type: 0 }],
                serverInfo: { name: 'Test TS3', host: 'ts.test.com', port: 9987, maxClients: 32 }
            }),
            refreshCache: async () => {},
            setConfig: () => {},
            disconnect: async () => {},
            connect: async () => {}
        };

        treeService = new TeamSpeakTreeService();
        mockWidgetService = {
            updateWidget: async () => ({ ok: true, messageId: 'msg1' })
        };
        mockLogsService = {
            listLogs: async () => ({ logs: [{ id: '1', event_type: 'ts3_client_connect' }], total: 1, page: 1, limit: 50, pages: 1 })
        };

        controller = new TeamSpeakController(
            mockClientService,
            treeService,
            mockWidgetService,
            mockLogsService
        );
    });

    test('getStatus returns status, counts and serverInfo', async () => {
        const res = await controller.getStatus();
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.data.online, true);
        assert.strictEqual(res.data.channelCount, 1);
        assert.strictEqual(res.data.clientCount, 1);
        assert.strictEqual(res.data.server.name, 'Test TS3');
    });

    test('getTree returns parsed tree data and serverInfo', async () => {
        const res = await controller.getTree({ query: {} });
        assert.strictEqual(res.success, true);
        assert.ok(res.data.rootChannels);
        assert.strictEqual(res.data.channelCount, 1);
        assert.strictEqual(res.data.clientCount, 1);
        assert.strictEqual(res.data.serverInfo.host, 'ts.test.com');
    });

    test('refresh calls refreshCache and updateWidget', async () => {
        const res = await controller.refresh({ body: { guild_id: '123' }, query: {} });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.data.cacheRefreshed, true);
        assert.strictEqual(res.data.widgetResult.ok, true);
    });

    test('getLogs returns paginated logs', async () => {
        const res = await controller.getLogs({ query: { page: '1', limit: '10' } });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.data.total, 1);
        assert.strictEqual(res.data.logs[0].event_type, 'ts3_client_connect');
    });
});
