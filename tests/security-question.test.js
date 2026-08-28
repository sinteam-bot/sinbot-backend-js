const assert = require('node:assert');
const { container } = require('../src/core/container.js');
const { SecurityQuestionRepository } = require('../src/modules/security_question/security-question.repository.js');
const { SecurityQuestionService } = require('../src/modules/security_question/security-question.service.js');
const { SecurityQuestionController } = require('../src/modules/security_question/security-question.controller.js');

describe('Security Question (Captcha) Module Tests', () => {

    const userId = 'test_user_sec_1';
    const username = 'SecTester';
    const guildId = 'test_guild_sec_1';
    const channelId = 'test_chan_sec_1';

    test('Repository: should create, get and verify captcha in DB', async () => {
        const repo = container.resolve(SecurityQuestionRepository);
        const captcha = await repo.createCaptcha(userId, username, guildId, 'Combien font 3 plus 4 ?', '7', channelId, 10);

        assert.ok(captcha);
        assert.strictEqual(captcha.question, 'Combien font 3 plus 4 ?');
        assert.strictEqual(captcha.answer, '7');
        assert.strictEqual(captcha.attempts, 0);

        const userCaptcha = await repo.getUserCaptcha(userId, guildId);
        assert.ok(userCaptcha);
        assert.strictEqual(userCaptcha.answer, '7');

        await repo.markVerified(userId, guildId);
        const verified = await repo.getUserCaptcha(userId, guildId);
        assert.strictEqual(verified.is_verified, 1);

        const all = await repo.getAllCaptchas(5);
        assert.ok(Array.isArray(all));
        assert.ok(all.length >= 1);
    });

    test('Service: should generate valid French math questions', () => {
        const service = container.resolve(SecurityQuestionService);
        const q = service.generateMathQuestion();

        assert.ok(q.question);
        assert.ok(typeof q.answer === 'string');
        assert.ok(q.answer.length > 0);
        assert.ok(q.question.includes('Combien font'));
    });

    test('Service: should convert numbers to French words', () => {
        const service = container.resolve(SecurityQuestionService);
        assert.strictEqual(service.numberToFrench(1), 'un');
        assert.strictEqual(service.numberToFrench(7), 'sept');
        assert.strictEqual(service.numberToFrench(10), 'dix');
    });

    test('Repository & Service: should retrieve channel details and message history', async () => {
        const repo = container.resolve(SecurityQuestionRepository);
        const service = container.resolve(SecurityQuestionService);

        const details = await repo.getCaptchaChannelDetails(channelId, userId);
        assert.ok(details);
        assert.ok(details.channel);
        assert.ok(Array.isArray(details.messages));
        assert.ok(Array.isArray(details.events));

        const serviceHistory = await service.getChannelHistory(channelId, userId);
        assert.ok(serviceHistory);
        assert.ok(serviceHistory.channel);
    });

    test('Controller: should return overview, status and channel messages', async () => {
        const controller = container.resolve(SecurityQuestionController);
        const resLogs = await controller.getLogs();
        assert.ok(resLogs.success);
        assert.ok(resLogs.data);
        assert.ok(Array.isArray(resLogs.data.captchas));

        const resStatus = await controller.getStatus();
        assert.ok(resStatus.success);

        const resMessages = await controller.getChannelMessages({
            query: { channel_id: channelId, user_id: userId }
        });
        assert.ok(resMessages.success);
        assert.ok(resMessages.data);
        assert.ok(Array.isArray(resMessages.data.messages));
    });

    test('CaptchaLogger: should build rich interactive embed and send logs properly', async () => {
        const { buildCaptchaLogEmbed, sendCaptchaLog } = require('../src/modules/security_question/captcha-logger.js');

        // Test 1: Création de canal
        const creationResult = buildCaptchaLogEmbed('Création canal', 'Canal créé pour test', '#5865F2', {
            userId: '123456789012345678',
            username: 'TestUser#0001',
            channelId: '987654321098765432',
            channelName: 'captcha-testuser',
            question: 'Combien font 4 plus 5 ?',
            timeoutMinutes: 10,
            maxAttempts: 3
        });

        assert.ok(creationResult.embed);
        assert.ok(creationResult.embed.data.title.includes('Début de vérification'));
        assert.strictEqual(creationResult.embed.data.color, 0x5865F2);
        assert.ok(creationResult.embed.data.fields.length >= 4);
        assert.ok(creationResult.row);

        // Test 2: Succès captcha
        const successResult = buildCaptchaLogEmbed('Succès captcha', 'Vérification réussie', '#57F287', {
            userId: '123456789012345678',
            username: 'TestUser#0001',
            userAnswer: '9',
            question: 'Combien font 4 plus 5 ?',
            attempts: 1,
            maxAttempts: 3,
            role: { id: '111222333', name: 'Vérifié' }
        });

        assert.ok(successResult.embed.data.title.includes('Vérification Réussie'));
        assert.strictEqual(successResult.embed.data.color, 0x57F287);

        // Test 3: Kick / Échec
        const kickResult = buildCaptchaLogEmbed('Kick utilisateur', 'Membre kické', '#ED4245', {
            userId: '123456789012345678',
            username: 'TestUser#0001',
            attempts: 3,
            maxAttempts: 3,
            reason: 'Max tentatives dépassé'
        });

        assert.ok(kickResult.embed.data.title.includes('Expulsion du Membre'));
        assert.strictEqual(kickResult.embed.data.color, 0xED4245);

        // Test 4: Envoi mock avec guild
        const mockGuild = {
            channels: {
                fetch: async (id) => ({
                    isTextBased: () => true,
                    send: async (payload) => ({ id: 'mock_sent_msg_1', ...payload })
                })
            }
        };

        const sent = await sendCaptchaLog(mockGuild, 'Succès captcha', 'Test log sending', '#57F287', {
            userId: '123456'
        });
        assert.ok(sent);
        assert.strictEqual(sent.id, 'mock_sent_msg_1');
    });
});

