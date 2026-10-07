const assert = require('node:assert');
const { TeamSpeakCommands } = require('../../src/modules/util_teamspeak/commands/teamspeak.cmd.js');
const { TeamSpeakTreeService } = require('../../src/modules/util_teamspeak/services/teamspeak-tree.service.js');
const { PermissionFlagsBits } = require('discord.js');

describe('TeamSpeakCommands', () => {
    let commands;
    let mockClientService;
    let treeService;
    let mockWidgetService;
    let mockLogsService;

    beforeEach(() => {
        mockClientService = {
            refreshCache: async () => {},
            getTreeData: () => ({
                online: true,
                channels: [{ cid: 1, pid: 0, name: 'Lobby' }],
                clients: [{ clid: 10, cid: 1, nickname: 'Alice', type: 0 }],
                serverInfo: { name: 'Test TS3', host: 'ts.test.com', port: 9987, maxClients: 32 }
            }),
            isConnected: () => true,
            getServerInfo: () => ({ name: 'Test TS3', host: 'ts.test.com', port: 9987, maxClients: 32 }),
            _channels: [{ cid: 1, pid: 0, name: 'Lobby' }],
            _clients: [{ clid: 10, cid: 1, nickname: 'Alice', type: 0 }]
        };

        treeService = new TeamSpeakTreeService();

        mockWidgetService = {
            setClient: () => {},
            updateWidget: async () => ({ ok: true, messageId: 'msg123' }),
            refreshNow: async () => ({ ok: true, messageId: 'msg123' })
        };

        mockLogsService = {
            setConfig: () => {},
            setClient: () => {}
        };

        commands = new TeamSpeakCommands(
            mockClientService,
            treeService,
            mockWidgetService,
            mockLogsService
        );
    });

    test('executeTree responds with tree embed and action row', async () => {
        let replied = null;
        const mockInteraction = {
            guildId: 'guild1',
            options: {
                getSubcommand: () => 'tree',
                getBoolean: (name) => false
            },
            deferReply: async () => {},
            editReply: async (payload) => {
                replied = payload;
                return payload;
            }
        };

        await commands.execute(mockInteraction);
        assert.ok(replied);
        assert.ok(replied.embeds);
        assert.ok(replied.components);
    });

    test('executeStatus responds with technical server info', async () => {
        let replied = null;
        const mockInteraction = {
            options: {
                getSubcommand: () => 'status'
            },
            deferReply: async () => {},
            editReply: async (payload) => {
                replied = payload;
                return payload;
            }
        };

        await commands.execute(mockInteraction);
        assert.ok(replied);
        assert.ok(replied.embeds);
        assert.ok(replied.embeds[0].data.title.includes('État du serveur'));
    });

    test('executeWidget checks ManageGuild permission', async () => {
        let replied = null;
        const mockInteraction = {
            memberPermissions: {
                has: (perm) => false
            },
            options: {
                getSubcommand: () => 'widget',
                getString: () => 'setup',
                getChannel: () => ({ id: 'chan1' })
            },
            reply: async (payload) => {
                replied = payload;
                return payload;
            }
        };

        await commands.execute(mockInteraction);
        assert.ok(replied);
        assert.ok(replied.content.includes('Gérer le serveur'));
    });

    test('executeWidget setup deploys widget and returns confirmation', async () => {
        let edited = null;
        const mockInteraction = {
            guildId: 'guild1',
            memberPermissions: {
                has: (perm) => perm === PermissionFlagsBits.ManageGuild
            },
            options: {
                getSubcommand: () => 'widget',
                getString: (name) => name === 'action' ? 'setup' : null,
                getChannel: (name) => name === 'salon' ? { id: 'chan1' } : null
            },
            client: {},
            deferReply: async () => {},
            editReply: async (payload) => {
                edited = payload;
                return payload;
            }
        };

        await commands.execute(mockInteraction);
        assert.ok(edited);
        assert.ok(edited.content.includes('Widget TeamSpeak 3 déployé'));
    });

    test('executeLogs setup configures log channel', async () => {
        let edited = null;
        const mockInteraction = {
            guildId: 'guild1',
            memberPermissions: {
                has: (perm) => perm === PermissionFlagsBits.ManageGuild
            },
            options: {
                getSubcommand: () => 'logs',
                getString: (name) => name === 'action' ? 'setup' : null,
                getChannel: (name) => name === 'salon' ? { id: 'logchan1' } : null
            },
            client: {},
            deferReply: async () => {},
            editReply: async (payload) => {
                edited = payload;
                return payload;
            }
        };

        await commands.execute(mockInteraction);
        assert.ok(edited);
        assert.ok(edited.content.includes('Salon de logs TeamSpeak 3 configuré'));
    });
});
