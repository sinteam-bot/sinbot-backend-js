const assert = require('node:assert');
const { TeamSpeakWidgetService } = require('../../src/modules/util_teamspeak/services/teamspeak-widget.service.js');
const { TeamSpeakTreeService } = require('../../src/modules/util_teamspeak/services/teamspeak-tree.service.js');

describe('TeamSpeakWidgetService', () => {
    let widgetService;
    let mockClientService;
    let treeService;

    beforeEach(() => {
        mockClientService = {
            getTreeData: () => ({
                online: true,
                channels: [{ cid: 1, pid: 0, name: 'Lobby' }],
                clients: [{ clid: 10, cid: 1, nickname: 'Alice', type: 0 }],
                serverInfo: { name: 'Test TS3', host: 'ts.test.com', port: 9987, maxClients: 32 }
            }),
            refreshCache: async () => {}
        };
        treeService = new TeamSpeakTreeService();
        widgetService = new TeamSpeakWidgetService(mockClientService, treeService);
    });

    test('returns error when Discord client is not initialized', async () => {
        const res = await widgetService.updateWidget('guild1');
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, 'Client Discord non initialisé');
    });

    test('returns error when widget is disabled in config', async () => {
        widgetService.setClient({ channels: { fetch: async () => null } });
        widgetService.getConfig = async () => ({
            widget: { enabled: false, channel_id: '123' }
        });

        const res = await widgetService.updateWidget('guild1');
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, 'Widget désactivé');
    });

    test('returns error when channel_id is not configured', async () => {
        widgetService.setClient({ channels: { fetch: async () => null } });
        widgetService.getConfig = async () => ({
            widget: { enabled: true, channel_id: null }
        });

        const res = await widgetService.updateWidget('guild1');
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, 'Aucun salon configuré pour le widget');
    });

    test('edits existing message when message_id exists', async () => {
        let edited = false;
        const mockMessage = {
            id: 'msg999',
            edit: async () => {
                edited = true;
                return mockMessage;
            }
        };

        const mockChannel = {
            isTextBased: () => true,
            messages: {
                fetch: async (id) => id === 'msg999' ? mockMessage : null
            }
        };

        const mockClient = {
            channels: {
                fetch: async (id) => id === 'chan1' ? mockChannel : null
            }
        };

        widgetService.setClient(mockClient);
        widgetService.getConfig = async () => ({
            widget: { enabled: true, channel_id: 'chan1', message_id: 'msg999' }
        });

        const res = await widgetService.updateWidget('guild1');
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.action, 'edited');
        assert.strictEqual(edited, true);
    });

    test('sends new message when message_id is null', async () => {
        let sentPayload = null;
        const mockChannel = {
            isTextBased: () => true,
            send: async (payload) => {
                sentPayload = payload;
                return { id: 'msg_new' };
            }
        };

        const mockClient = {
            channels: {
                fetch: async (id) => id === 'chan1' ? mockChannel : null
            }
        };

        widgetService.setClient(mockClient);
        widgetService.getConfig = async () => ({
            widget: { enabled: true, channel_id: 'chan1', message_id: null }
        });

        const res = await widgetService.updateWidget('guild1');
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.action, 'created');
        assert.strictEqual(res.messageId, 'msg_new');
        assert.ok(sentPayload);
        assert.ok(sentPayload.embeds);
    });

    test('debounces scheduleUpdate calls', async () => {
        let updateCount = 0;
        widgetService.updateWidget = async () => {
            updateCount++;
            return { ok: true };
        };

        widgetService.scheduleUpdate('guild1', 50);
        widgetService.scheduleUpdate('guild1', 50);
        widgetService.scheduleUpdate('guild1', 50);

        await new Promise(r => setTimeout(r, 80));
        assert.strictEqual(updateCount, 1);
    });
});
