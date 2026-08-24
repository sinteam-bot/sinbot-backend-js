const { test, describe } = require('node:test');
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

    test('Controller: should return overview and status', async () => {
        const controller = container.resolve(SecurityQuestionController);
        const resLogs = await controller.getLogs();
        assert.ok(resLogs.success);
        assert.ok(resLogs.data);
        assert.ok(Array.isArray(resLogs.data.captchas));

        const resStatus = await controller.getStatus();
        assert.ok(resStatus.success);
    });

});
