const assert = require('node:assert');
const { container } = require('../src/core/container.js');
const { DailyMessageRepository } = require('../src/modules/feature_daily-message/daily-message.repository.js');
const { DailyMessageService } = require('../src/modules/feature_daily-message/daily-message.service.js');
const { DailyMessageController } = require('../src/modules/feature_daily-message/daily-message.controller.js');

describe('Feature: Daily Message Module Tests', () => {

    test('Repository: should save AI messages and update publication state', async () => {
        const repo = container.resolve(DailyMessageRepository);
        const msg = await repo.saveAiMessage({
            msgid: `test_msg_${Date.now()}`,
            prompt: 'Prompt test',
            instruction: 'Instruction test',
            model: 'gpt-4o-mini',
            tokeninput: 50,
            tokenoutput: 100,
            content: 'Bonjour à tous ! Bonne journée !',
            type: 'daily_message'
        });

        assert.ok(msg);
        assert.strictEqual(msg.content, 'Bonjour à tous ! Bonne journée !');

        const messages = await repo.getAiMessages('daily_message', 5);
        assert.ok(Array.isArray(messages));
        assert.ok(messages.length >= 1);

        await repo.setLastPublishedDate('2026-08-24');
        const lastPub = await repo.getLastPublishedDate();
        assert.strictEqual(lastPub, '2026-08-24');
    });

    test('Service: should build preview embeds and action buttons', () => {
        const service = container.resolve(DailyMessageService);

        const buttonsRow = service.buildActionButtons(false);
        assert.ok(buttonsRow);
        assert.strictEqual(buttonsRow.components.length, 2);

        const embed = service.buildPreviewEmbed({
            text: 'Pensée du jour : Chaque jour est une opportunité.',
            date: new Date(),
            model: 'gpt-4o-mini'
        });
        assert.ok(embed);
        assert.ok(embed.data.description.includes('Pensée du jour'));
    });

    test('Service: should handle accept button interaction', async () => {
        const service = container.resolve(DailyMessageService);
        const repo = container.resolve(DailyMessageRepository);

        let edited = null;
        let deferred = false;

        const mockInteraction = {
            isButton: () => true,
            customId: 'daily_msg_accept',
            message: {
                id: 'preview_msg_123',
                embeds: [
                    { description: '>>> Pensée du jour testée\n\n*Cliquez ci-dessous*' }
                ]
            },
            user: { username: 'AdminTester', tag: 'AdminTester#0001' },
            deferUpdate: async () => { deferred = true; },
            editReply: async (payload) => { edited = payload; }
        };

        await service.handleButtonInteraction(mockInteraction);

        assert.strictEqual(deferred, true);
        assert.ok(edited);

        const savedDraft = await repo.getBotState('daily_msg_accepted_draft');
        assert.ok(savedDraft);
    });

    test('Controller: should return status object', async () => {
        const controller = container.resolve(DailyMessageController);
        const res = await controller.getStatus();

        assert.ok(res.success);
        assert.ok(res.data);
        assert.strictEqual(typeof res.data.enabled, 'boolean');
    });

});
