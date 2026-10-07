const assert = require('node:assert');
const { TeamSpeakTreeService } = require('../../src/modules/util_teamspeak/services/teamspeak-tree.service.js');

describe('TeamSpeakTreeService', () => {
    let service;

    beforeEach(() => {
        service = new TeamSpeakTreeService();
    });

    describe('cleanChannelName', () => {
        test('preserves regular channel names', () => {
            assert.strictEqual(service.cleanChannelName('Général'), 'Général');
            assert.strictEqual(service.cleanChannelName('Salle de Jeux #1'), 'Salle de Jeux #1');
        });

        test('cleans repetitive spacers', () => {
            const cleaned = service.cleanChannelName('[*spacer0]─');
            assert.ok(cleaned.startsWith('─── '));
            assert.ok(cleaned.endsWith(' ───'));
        });

        test('cleans centered spacers', () => {
            assert.strictEqual(service.cleanChannelName('[cspacer]Salons Publics'), '── Salons Publics ──');
            assert.strictEqual(service.cleanChannelName('[cspacer01]Gaming'), '── Gaming ──');
        });

        test('cleans left and right spacers', () => {
            assert.strictEqual(service.cleanChannelName('[lspacer]Règlement'), '── Règlement');
            assert.strictEqual(service.cleanChannelName('[rspacer]Informations'), '── Informations');
        });

        test('cleans simple spacers', () => {
            assert.strictEqual(service.cleanChannelName('[spacer0]Accueil'), 'Accueil');
        });

        test('handles empty or null name', () => {
            assert.strictEqual(service.cleanChannelName(''), '');
            assert.strictEqual(service.cleanChannelName(null), '');
        });
    });

    describe('formatClientStatus', () => {
        test('returns empty string for normal active client', () => {
            const client = { outputMuted: false, inputMuted: false, away: false };
            assert.strictEqual(service.formatClientStatus(client), '');
        });

        test('returns muted icon for output muted', () => {
            const client = { outputMuted: true, inputMuted: false, away: false };
            assert.strictEqual(service.formatClientStatus(client), ' 🔇');
        });

        test('returns mic muted icon for input muted only', () => {
            const client = { outputMuted: false, inputMuted: true, away: false };
            assert.strictEqual(service.formatClientStatus(client), ' 🎙️❌');
        });

        test('returns away message when client is away', () => {
            const client = { outputMuted: false, inputMuted: false, away: 1, awayMessage: 'Manger' };
            assert.strictEqual(service.formatClientStatus(client), ' 💤 [Manger]');
        });

        test('combines muted and away flags', () => {
            const client = { outputMuted: true, inputMuted: false, away: 1 };
            assert.strictEqual(service.formatClientStatus(client), ' 🔇 💤 [Absent]');
        });
    });

    describe('buildTree', () => {
        const mockChannels = [
            { cid: 1, pid: 0, name: 'Lobby', order: 0 },
            { cid: 2, pid: 0, name: 'Jeux', order: 1 },
            { cid: 3, pid: 2, name: 'Valorant', order: 0 },
            { cid: 4, pid: 2, name: 'CS2', order: 1 },
            { cid: 5, pid: 0, name: 'AFK', order: 2 }
        ];

        const mockClients = [
            { clid: 10, cid: 1, nickname: 'Alice', type: 0 },
            { clid: 11, cid: 1, nickname: 'Bob', type: 0, inputMuted: true },
            { clid: 12, cid: 3, nickname: 'Charlie', type: 0 },
            { clid: 13, cid: 5, nickname: 'David', type: 0, away: 1, awayMessage: 'Pause' },
            { clid: 99, cid: 1, nickname: 'QueryBot', type: 1 } // ServerQuery client
        ];

        test('builds hierarchy matching parent-child channels and clients', () => {
            const result = service.buildTree(mockChannels, mockClients);

            assert.strictEqual(result.channelCount, 5);
            assert.strictEqual(result.clientCount, 4); // QueryBot filtered out by default
            assert.strictEqual(result.rootChannels.length, 3); // Lobby, Jeux, AFK

            // Lobby
            const lobby = result.rootChannels.find(c => c.cid === 1);
            assert.ok(lobby);
            assert.strictEqual(lobby.clients.length, 2);
            assert.strictEqual(lobby.clients[0].nickname, 'Alice');
            assert.strictEqual(lobby.clients[1].nickname, 'Bob');

            // Jeux with subchannels
            const jeux = result.rootChannels.find(c => c.cid === 2);
            assert.ok(jeux);
            assert.strictEqual(jeux.subchannels.length, 2); // Valorant & CS2

            const valorant = jeux.subchannels.find(c => c.cid === 3);
            assert.ok(valorant);
            assert.strictEqual(valorant.clients.length, 1);
            assert.strictEqual(valorant.clients[0].nickname, 'Charlie');
        });

        test('includes query clients when showQueryClients is true', () => {
            const result = service.buildTree(mockChannels, mockClients, { showQueryClients: true });
            assert.strictEqual(result.clientCount, 5);
        });

        test('hides empty channels when hideEmptyChannels is true', () => {
            const result = service.buildTree(mockChannels, mockClients, { hideEmptyChannels: true });

            // CS2 has 0 clients and should be filtered out from Jeux subchannels
            const jeux = result.rootChannels.find(c => c.cid === 2);
            assert.ok(jeux);
            assert.strictEqual(jeux.subchannels.length, 1);
            assert.strictEqual(jeux.subchannels[0].cid, 3);
        });
    });

    describe('formatAsciiTree', () => {
        test('renders formatted text tree with channel IDs and clients', () => {
            const mockTree = [
                {
                    cid: 1,
                    displayName: 'Lobby',
                    clients: [{ nickname: 'Alice', outputMuted: false, inputMuted: false, away: false }],
                    subchannels: []
                },
                {
                    cid: 2,
                    displayName: 'Gaming',
                    clients: [],
                    subchannels: [
                        {
                            cid: 3,
                            displayName: 'Valorant',
                            clients: [{ nickname: 'Bob', outputMuted: false, inputMuted: true, away: false }],
                            subchannels: []
                        }
                    ]
                }
            ];

            const text = service.formatAsciiTree(mockTree);
            assert.ok(text.includes('📁 Lobby [1]'));
            assert.ok(text.includes('👤 Alice'));
            assert.ok(text.includes('📁 Gaming [2]'));
            assert.ok(text.includes('📁 Valorant [3]'));
            assert.ok(text.includes('👤 Bob 🎙️❌'));
        });

        test('can omit channel IDs when showChannelIds is false', () => {
            const mockTree = [
                {
                    cid: 1,
                    displayName: 'Lobby',
                    clients: [],
                    subchannels: []
                }
            ];

            const text = service.formatAsciiTree(mockTree, { showChannelIds: false });
            assert.ok(text.includes('📁 Lobby'));
            assert.ok(!text.includes('[1]'));
        });
    });

    describe('buildDiscordEmbed', () => {
        test('builds Discord embed with online status and formatted tree', () => {
            const treeResult = {
                rootChannels: [
                    { cid: 1, displayName: 'Lobby', clients: [{ nickname: 'Alice' }], subchannels: [] }
                ],
                channelCount: 1,
                clientCount: 1
            };

            const serverInfo = {
                online: true,
                name: 'Test TS3',
                host: 'ts.test.com',
                port: 9987,
                maxClients: 32
            };

            const embed = service.buildDiscordEmbed(treeResult, serverInfo);
            assert.ok(embed.data.title.includes('TeamSpeak'));
            assert.ok(embed.data.description.includes('ts.test.com:9987'));
            assert.ok(embed.data.description.includes('Alice'));
            assert.ok(embed.data.description.includes('1 / 32'));
        });

        test('builds Discord embed with offline status when server is unreachable', () => {
            const treeResult = { rootChannels: [], channelCount: 0, clientCount: 0 };
            const serverInfo = { online: false, host: '127.0.0.1', port: 9987 };

            const embed = service.buildDiscordEmbed(treeResult, serverInfo);
            assert.ok(embed.data.description.includes('Hors ligne'));
        });
    });

    describe('buildActionRow', () => {
        test('creates button action row with refresh and join buttons', () => {
            const row = service.buildActionRow('123456', { joinUrl: 'https://ts.myserver.com' });
            assert.ok(row.components.length >= 2);
            assert.strictEqual(row.components[0].data.custom_id, 'ts3:refresh:123456');
            assert.strictEqual(row.components[1].data.url, 'https://ts.myserver.com');
        });

        test('omits join button when joinUrl is not provided', () => {
            const row = service.buildActionRow('123456', { host: '127.0.0.1', port: 9987 });
            assert.strictEqual(row.components.length, 1);
            assert.strictEqual(row.components[0].data.custom_id, 'ts3:refresh:123456');
        });
    });
});
