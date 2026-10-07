const assert = require('node:assert');
const { TeamSpeakLogsService } = require('../../src/modules/util_teamspeak/services/teamspeak-logs.service.js');

describe('TeamSpeakLogsService', () => {
    let service;

    beforeEach(() => {
        service = new TeamSpeakLogsService();
    });

    describe('isEventEnabled', () => {
        test('returns true by default when no config is provided', () => {
            assert.strictEqual(service.isEventEnabled('ts3_client_connect'), true);
        });

        test('returns false when logs are disabled globally', () => {
            service.setConfig({ enabled: false });
            assert.strictEqual(service.isEventEnabled('ts3_client_connect'), false);
        });

        test('respects individual event toggles in config', () => {
            service.setConfig({
                enabled: true,
                events: {
                    client_connect: true,
                    client_disconnect: false
                }
            });

            assert.strictEqual(service.isEventEnabled('ts3_client_connect'), true);
            assert.strictEqual(service.isEventEnabled('ts3_client_disconnect'), false);
        });
    });

    describe('buildLogEmbed', () => {
        test('builds connection embed with green color', () => {
            const embed = service.buildLogEmbed('ts3_client_connect', {
                nickname: 'Alex',
                channelName: 'Accueil',
                summary: '🟢 **Alex** s\'est connecté sur TeamSpeak'
            });

            assert.strictEqual(embed.data.color, 0x57F287);
            assert.ok(embed.data.title.includes('Connexion'));
            assert.ok(embed.data.description.includes('Alex'));
            assert.strictEqual(embed.data.fields[0].name, 'Utilisateur');
            assert.strictEqual(embed.data.fields[0].value, '**Alex**');
            assert.strictEqual(embed.data.fields[1].name, 'Salon');
            assert.strictEqual(embed.data.fields[1].value, 'Accueil');
        });

        test('builds disconnection embed with red color and reason', () => {
            const embed = service.buildLogEmbed('ts3_client_disconnect', {
                nickname: 'Bob',
                reason: 'Leaving',
                summary: '🔴 **Bob** a quitté TeamSpeak'
            });

            assert.strictEqual(embed.data.color, 0xED4245);
            assert.ok(embed.data.title.includes('Déconnexion'));
            assert.ok(embed.data.fields.some(f => f.name === 'Raison' && f.value === 'Leaving'));
        });

        test('builds movement embed with blue color and channels', () => {
            const embed = service.buildLogEmbed('ts3_client_moved', {
                nickname: 'Charlie',
                fromChannel: 'Accueil',
                toChannel: 'Gaming',
                summary: '🔄 **Charlie** s\'est déplacé'
            });

            assert.strictEqual(embed.data.color, 0x5865F2);
            assert.ok(embed.data.title.includes('Déplacement'));
            assert.ok(embed.data.fields.some(f => f.name === 'Ancien salon' && f.value === 'Accueil'));
            assert.ok(embed.data.fields.some(f => f.name === 'Nouveau salon' && f.value === 'Gaming'));
        });
    });

    describe('log and dispatch', () => {
        test('returns null if event is disabled', async () => {
            service.setConfig({ enabled: false });
            const result = await service.log('guild1', 'ts3_client_connect', { nickname: 'Alex' });
            assert.strictEqual(result, null);
        });

        test('emits log.published event and returns entry object', async () => {
            service.setConfig({ enabled: true });
            let publishedEntry = null;
            service.on('log.published', (e) => {
                publishedEntry = e;
            });

            const result = await service.log('guild1', 'ts3_client_connect', {
                nickname: 'Alex',
                summary: 'Connecté'
            });

            assert.ok(result);
            assert.ok(result.id);
            assert.strictEqual(result.guild_id, 'guild1');
            assert.strictEqual(result.event_type, 'ts3_client_connect');
            assert.strictEqual(result.nickname, 'Alex');
            assert.strictEqual(publishedEntry?.id, result.id);
        });

        test('sends embed to configured Discord channel', async () => {
            let sentEmbeds = null;
            const mockChannel = {
                isTextBased: () => true,
                send: async (payload) => {
                    sentEmbeds = payload.embeds;
                    return { id: 'msg1' };
                }
            };

            const mockClient = {
                channels: {
                    fetch: async (id) => id === 'chan123' ? mockChannel : null
                }
            };

            service.setClient(mockClient);
            service.setConfig({ enabled: true, channel_id: 'chan123' });

            await service.log('guild1', 'ts3_client_connect', {
                nickname: 'Alex',
                channelName: 'Lobby',
                summary: 'Test join'
            });

            assert.ok(sentEmbeds);
            assert.strictEqual(sentEmbeds.length, 1);
            assert.ok(sentEmbeds[0].data.title.includes('Connexion'));
        });
    });
});
