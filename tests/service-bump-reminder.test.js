const { test, describe } = require('node:test');
const assert = require('node:assert');
const { container } = require('../src/core/container.js');
const { BumpReminderRepository } = require('../src/modules/service_bump-reminder/bump-reminder.repository.js');
const { BumpReminderService } = require('../src/modules/service_bump-reminder/bump-reminder.service.js');
const { BumpReminderController } = require('../src/modules/service_bump-reminder/bump-reminder.controller.js');

describe('Service: Bump Reminder Module Tests', () => {

    const guildId = 'test_guild_bump';
    const channelId = 'test_channel_bump';

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

        await service.handleDisboardMessage(mockDisboardMsg);
        const last = await repo.getLastBump(guildId);
        assert.ok(last);
        assert.strictEqual(last.bumper_id, 'user_bumper_2');
    });

    test('Controller: should return bump status', async () => {
        const controller = container.resolve(BumpReminderController);
        const res = await controller.getStatus({ query: { guild_id: guildId } });

        assert.ok(res.success);
        assert.ok(res.data);
        assert.strictEqual(typeof res.data.hasBump, 'boolean');
    });

});
