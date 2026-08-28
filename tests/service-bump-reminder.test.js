const assert = require('node:assert');
const { container } = require('../src/core/container.js');
const { BumpReminderRepository } = require('../src/modules/service_bump-reminder/bump-reminder.repository.js');
const { BumpReminderService } = require('../src/modules/service_bump-reminder/bump-reminder.service.js');
const { BumpReminderController } = require('../src/modules/service_bump-reminder/bump-reminder.controller.js');

describe('Service: Bump Reminder Module Tests', () => {

    const guildId = 'test_guild_bump';
    const channelId = 'test_channel_bump';

    beforeAll(async () => {
        const repo = container.resolve(BumpReminderRepository);
        await repo.deleteTestBumps();
    });

    afterAll(async () => {
        const repo = container.resolve(BumpReminderRepository);
        await repo.deleteTestBumps();
    });

    test('Repository: should save bump and retrieve last bump', async () => {
        const repo = container.resolve(BumpReminderRepository);
        const bump = await repo.saveBump(guildId, channelId, 'user_bumper_1', 'BumperMan');

        assert.ok(bump);
        assert.strictEqual(bump.guild_id, guildId);
        assert.strictEqual(bump.bumper_username, 'BumperMan');
        assert.strictEqual(bump.reminder_sent, 0);

        const last = await repo.getLastBump(guildId);
        assert.ok(last);
        assert.strictEqual(last.bumper_id, 'user_bumper_1');

        await repo.markReminderSent(bump.id);
        const history = await repo.getHistory(5);
        assert.ok(Array.isArray(history));
    });

    test('Service: should detect Disboard message and record bump', async () => {
        const service = container.resolve(BumpReminderService);
        const repo = container.resolve(BumpReminderRepository);

        const origGetConfig = service.getConfig;
        service.getConfig = () => ({ enabled: true, reminder_cooldown_hours: 2 });

        const mockDisboardMsg = {
            guild: { id: guildId },
            channel: { id: channelId },
            author: { id: '302050872383242240', bot: true },
            embeds: [
                {
                    title: 'DISBOARD: Discord Server List',
                    description: 'Bump effectué ! 👍\nProchain bump disponible dans 2 heures.'
                }
            ],
            interactionMetadata: {
                user: { id: 'user_bumper_2', username: 'SuperBumper', globalName: 'SuperBumper' }
            },
            client: { users: { cache: new Map() } }
        };

        try {
            await service.handleDisboardMessage(mockDisboardMsg);
            const last = await repo.getLastBump(guildId);
            assert.ok(last);
            assert.strictEqual(last.bumper_id, 'user_bumper_2');
            await repo.markReminderSent(last.id);
        } finally {
            service.getConfig = origGetConfig;
        }
    });

    test('Service: should send simple text bump reminder without embed by default', async () => {
        const service = container.resolve(BumpReminderService);

        let sentPayload = null;
        const mockClient = {
            channels: {
                fetch: async (id) => ({
                    id,
                    isTextBased: () => true,
                    send: async (payload) => {
                        sentPayload = payload;
                        return { id: 'sent_msg_123' };
                    }
                })
            }
        };

        const testBump = {
            id: 999999,
            channel_id: '123456789012345678',
            bumper_id: '1003058288461623438',
            bumper_username: 'TestUser',
            bumped_at: new Date(Date.now() - 3 * 3600 * 1000)
        };

        await service.sendBumpReminder(mockClient, testBump);
        assert.ok(sentPayload);
        assert.ok(typeof sentPayload.content === 'string');
        assert.ok(sentPayload.content.includes("c'est l'heure de bumper"));
    });

    test('Service: should send bump reminder embed when use_embed is true', async () => {
        const service = container.resolve(BumpReminderService);
        const originalGetConfig = service.getConfig.bind(service);
        service.getConfig = () => ({
            ...originalGetConfig(),
            use_embed: true
        });

        try {
            let sentPayload = null;
            const mockClient = {
                channels: {
                    fetch: async (id) => ({
                        id,
                        isTextBased: () => true,
                        send: async (payload) => {
                            sentPayload = payload;
                            return { id: 'sent_msg_123' };
                        }
                    })
                }
            };

            const testBump = {
                id: 999999,
                channel_id: '123456789012345678',
                bumped_at: new Date(Date.now() - 3 * 3600 * 1000)
            };

            await service.sendBumpReminder(mockClient, testBump);
            assert.ok(sentPayload);
            assert.ok(sentPayload.embeds && sentPayload.embeds.length > 0);
        } finally {
            service.getConfig = originalGetConfig;
        }
    });

    test('Service: should format placeholders in custom bump reminder message and embed', async () => {
        const service = container.resolve(BumpReminderService);

        const customVars = {
            hours: 2,
            role: '<@&111222333>',
            user: '@SuperBumper',
            command: '</bump:947088344167366698>',
            server: 'Mon Super Serveur'
        };

        const formattedTitle = service.formatMessageText('⏰ {server} : Bump prêt !', customVars);
        assert.strictEqual(formattedTitle, '⏰ Mon Super Serveur : Bump prêt !');

        const formattedDesc = service.formatMessageText('{hours}h écoulées depuis le bump de {user}. Tapez {command} !', customVars);
        assert.strictEqual(formattedDesc, '2h écoulées depuis le bump de @SuperBumper. Tapez </bump:947088344167366698> !');

        const formattedContent = service.formatMessageText('🔔 {role} C\'est l\'heure !', customVars);
        assert.strictEqual(formattedContent, '🔔 <@&111222333> C\'est l\'heure !');
    });

    test('Controller: should return bump status and save customized config', async () => {
        const controller = container.resolve(BumpReminderController);
        const res = await controller.getStatus({ query: { guild_id: guildId } });

        assert.ok(res.success);
        assert.ok(res.data);
        assert.strictEqual(typeof res.data.hasBump, 'boolean');

        const saveRes = await controller.saveConfig({
            body: {
                enabled: true,
                channel_id: '123456789012345678',
                role_id: '987654321098765432',
                reminder_cooldown_hours: 2,
                messages: {
                    content: '🔔 {role}',
                    title: '⏰ C\'est l\'heure du Bump personnalisé !',
                    description: '2 heures se sont écoulées, merci {user} ! Tapez {command}',
                    color: '#ff66aa',
                    footer: 'Mon Footer Custom'
                }
            }
        });

        assert.ok(saveRes.success);
        assert.strictEqual(saveRes.data.messages.title, '⏰ C\'est l\'heure du Bump personnalisé !');
        assert.strictEqual(saveRes.data.messages.color, '#ff66aa');
    });
});

