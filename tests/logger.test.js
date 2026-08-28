const assert = require('node:assert');
const logger = require('../src/utils/logger.js');

describe('BotLogger & Winston-Style Source Localization Tests', () => {

    test('getCallerLocation correctly extracts calling file and line', () => {
        const caller = logger.getCallerLocation();
        assert.ok(caller);
        assert.ok(caller.file.includes('logger.test.js'));
        assert.ok(caller.line > 0);
    });

    test('inferModuleFromPath accurately identifies module from relative path', () => {
        assert.strictEqual(logger.inferModuleFromPath('src/modules/service_bump-reminder/bump-reminder.service.js'), 'BUMP');
        assert.strictEqual(logger.inferModuleFromPath('src/modules/feature_welcome/welcome.service.js'), 'WELCOME');
        assert.strictEqual(logger.inferModuleFromPath('src/modules/feature_daily-message/daily-message.service.js'), 'DAILY');
        assert.strictEqual(logger.inferModuleFromPath('src/modules/security_question/security-question.service.js'), 'CAPTCHA');
        assert.strictEqual(logger.inferModuleFromPath('src/modules/feature_xp-level/xp-level.service.js'), 'XP');
        assert.strictEqual(logger.inferModuleFromPath('src/modules/game_count-down/count-down.service.js'), 'COUNTDOWN');
        assert.strictEqual(logger.inferModuleFromPath('src/modules/game_road-to-infinite/road-to-infinite.service.js'), 'INFINITE');
        assert.strictEqual(logger.inferModuleFromPath('src/modules/notifier_startup/startup-notifier.service.js'), 'STARTUP');
        assert.strictEqual(logger.inferModuleFromPath('src/services/imageProxyService.js'), 'API');
        assert.strictEqual(logger.inferModuleFromPath('src/db/legacy-bridge.js'), 'DATABASE');
    });

    test('addLog records caller location and metadata', () => {
        const entry = logger.info('Test de message localisé');
        assert.strictEqual(entry.level, 'INFO');
        assert.ok(entry.caller);
        assert.ok(entry.caller.file.includes('logger.test.js'));
        assert.strictEqual(entry.message, 'Test de message localisé');
    });

    test('createLogger provides scoped child logger (Winston style)', () => {
        const bumpLogger = logger.createLogger('BUMP');
        const entry = bumpLogger.info('Rappel envoyé');
        assert.strictEqual(entry.category, 'BUMP');
        assert.strictEqual(entry.message, 'Rappel envoyé');
    });

    test('getLogs filters by level, category and caller file search', () => {
        logger.info('Message de test recherche 12345', 'DISCORD');
        
        const filtered = logger.getLogs({ search: '12345' });
        assert.ok(filtered.length > 0);
        assert.ok(filtered.some(l => l.message.includes('12345')));
    });
});
