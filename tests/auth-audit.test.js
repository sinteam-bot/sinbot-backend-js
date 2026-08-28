const assert = require('node:assert');
const { AuthAuditService } = require('../src/services/auth-audit.service.js');
const { createTestDb } = require('../src/db/index.js');

describe('AuthAuditService Tests', () => {
    let testDbCtx;
    let auditService;

    beforeEach(async () => {
        testDbCtx = await createTestDb();
        auditService = new AuthAuditService(testDbCtx.db);
    });

    test('logEvent records security events properly', async () => {
        const logged = await auditService.logEvent({
            eventType: 'LOGIN_SUCCESS',
            userId: '1337543177086959657',
            username: 'Nosi',
            ipAddress: '127.0.0.1',
            userAgent: 'Vitest/TestRunner',
            metadata: { sessionId: 'sess_123' }
        });

        assert.ok(logged);
        assert.strictEqual(logged.eventType, 'LOGIN_SUCCESS');
        assert.strictEqual(logged.userId, '1337543177086959657');
        assert.strictEqual(logged.ipAddress, '127.0.0.1');
    });

    test('getLogs retrieves and filters audit logs', async () => {
        await auditService.logEvent({ eventType: 'LOGIN_SUCCESS', ipAddress: '1.1.1.1', userId: 'user_1' });
        await auditService.logEvent({ eventType: 'LOGIN_FAILURE', ipAddress: '2.2.2.2', userId: 'user_2', reason: 'invalid_pass' });
        await auditService.logEvent({ eventType: 'IP_BLOCKED', ipAddress: '2.2.2.2', userId: 'user_2' });

        const allLogs = await auditService.getLogs({ limit: 10 });
        assert.strictEqual(allLogs.total, 3);
        assert.strictEqual(allLogs.logs.length, 3);

        // Filtre par type
        const failureLogs = await auditService.getLogs({ eventType: 'LOGIN_FAILURE' });
        assert.strictEqual(failureLogs.total, 1);
        assert.strictEqual(failureLogs.logs[0].eventType, 'LOGIN_FAILURE');

        // Filtre par IP
        const ipLogs = await auditService.getLogs({ ipAddress: '2.2.2.2' });
        assert.strictEqual(ipLogs.total, 2);
    });

    test('logEvent returns null if eventType or ipAddress is missing', async () => {
        assert.strictEqual(await auditService.logEvent({ eventType: '', ipAddress: '127.0.0.1' }), null);
        assert.strictEqual(await auditService.logEvent({ eventType: 'TEST', ipAddress: '' }), null);
    });
});
