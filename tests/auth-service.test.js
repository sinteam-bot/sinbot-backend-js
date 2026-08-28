const assert = require('node:assert');
const { AuthService } = require('../src/services/auth.service.js');
const { createTestDb } = require('../src/db/index.js');

describe('AuthService Tests', () => {
    let testDbCtx;
    let authService;

    beforeEach(async () => {
        testDbCtx = await createTestDb();
        authService = new AuthService(testDbCtx.db);
    });

    test('generateAccessToken and verifyAccessToken work correctly', () => {
        const token = authService.generateAccessToken({
            userId: '1337543177086959657',
            username: 'TestUser',
            avatarUrl: 'https://example.com/avatar.png',
            role: 'admin',
            sessionId: 'sess_123'
        });

        assert.ok(typeof token === 'string');
        const decoded = authService.verifyAccessToken(token);

        assert.ok(decoded);
        assert.strictEqual(decoded.sub, '1337543177086959657');
        assert.strictEqual(decoded.username, 'TestUser');
        assert.strictEqual(decoded.role, 'admin');
        assert.strictEqual(decoded.sessionId, 'sess_123');
    });

    test('verifyAccessToken returns null for invalid or tampered tokens', () => {
        assert.strictEqual(authService.verifyAccessToken('invalid.jwt.token'), null);
        assert.strictEqual(authService.verifyAccessToken(''), null);
        assert.strictEqual(authService.verifyAccessToken(null), null);
    });

    test('createSession stores session in database and returns tokens', async () => {
        const result = await authService.createSession({
            userId: '1337543177086959657',
            username: 'Nosi',
            role: 'admin',
            ipAddress: '127.0.0.1',
            userAgent: 'Vitest/TestRunner'
        });

        assert.ok(result.accessToken);
        assert.ok(result.refreshToken);
        assert.ok(result.session.id);
        assert.strictEqual(result.session.userId, '1337543177086959657');
        assert.strictEqual(result.session.role, 'admin');

        // Vérifier que le refresh token est hashé et non stocké en clair
        assert.notStrictEqual(result.session.refreshTokenHash, result.refreshToken);
    });

    test('refreshTokens performs Refresh Token Rotation (RTR)', async () => {
        const initial = await authService.createSession({
            userId: '1337543177086959657',
            username: 'Nosi',
            role: 'admin',
            ipAddress: '127.0.0.1'
        });

        const refreshed = await authService.refreshTokens(initial.refreshToken, '127.0.0.1');

        assert.ok(refreshed.accessToken);
        assert.ok(refreshed.refreshToken);
        assert.notStrictEqual(refreshed.refreshToken, initial.refreshToken);
        assert.strictEqual(refreshed.user.userId, '1337543177086959657');

        // L'ancien refresh token ne doit plus être utilisable (RTR)
        await assert.rejects(
            async () => {
                await authService.refreshTokens(initial.refreshToken, '127.0.0.1');
            },
            /Session expirée ou invalide/
        );
    });

    test('revokeSession marks session as revoked', async () => {
        const initial = await authService.createSession({
            userId: '1337543177086959657',
            username: 'Nosi',
            role: 'admin'
        });

        await authService.revokeSession(initial.session.id);

        await assert.rejects(
            async () => {
                await authService.refreshTokens(initial.refreshToken);
            },
            /Session expirée ou invalide/
        );
    });

    test('determineRbacRole identifies owner and administrator as admin', () => {
        const ownerMember = { id: 'owner_123', roles: { cache: new Map() } };
        const guild = { ownerId: 'owner_123' };
        assert.strictEqual(authService.determineRbacRole(ownerMember, guild), 'admin');

        const adminMember = {
            id: 'admin_123',
            permissions: { has: (perm) => perm === 'Administrator' }
        };
        assert.strictEqual(authService.determineRbacRole(adminMember), 'admin');
    });

    test('determineRbacRole identifies moderation permissions as mod', () => {
        const modMember = {
            id: 'mod_123',
            permissions: { has: (perm) => perm === 'ModerateMembers' || perm === 'ManageMessages' }
        };
        assert.strictEqual(authService.determineRbacRole(modMember), 'mod');
    });

    test('determineRbacRole defaults to viewer', () => {
        const regularMember = {
            id: 'user_123',
            permissions: { has: () => false }
        };
        assert.strictEqual(authService.determineRbacRole(regularMember), 'viewer');
        assert.strictEqual(authService.determineRbacRole(null), 'viewer');
    });

    test('recordFailedAttempt blocks IP after maxFailedAttempts', async () => {
        const ip = '192.168.1.100';

        for (let i = 1; i < 5; i++) {
            const attempt = await authService.recordFailedAttempt(ip);
            assert.strictEqual(attempt.blocked, false);
            assert.strictEqual(attempt.attemptCount, i);
        }

        // 5ème tentative : blocage
        const fifth = await authService.recordFailedAttempt(ip);
        assert.strictEqual(fifth.blocked, true);
        assert.strictEqual(fifth.attemptCount, 5);
        assert.ok(fifth.blockedUntil > Date.now());

        const check = await authService.isBlocked(ip);
        assert.strictEqual(check.isBlocked, true);
        assert.ok(check.remainingMs > 0);

        // Déblocage
        await authService.clearFailedAttempts(ip);
        const afterClear = await authService.isBlocked(ip);
        assert.strictEqual(afterClear.isBlocked, false);
    });
});
