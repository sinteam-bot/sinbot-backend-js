const assert = require('node:assert');
const { requireRole, getClientIp } = require('../src/utils/security.js');

describe('RBAC Middleware Tests', () => {
    const mockRes = () => {
        const res = {
            statusCode: 200,
            body: null,
            status(code) { res.statusCode = code; return res; },
            json(data) { res.body = data; return res; }
        };
        return res;
    };

    test('requireRole allows admin for any requirement', () => {
        const req = { user: { userId: '1', role: 'admin' } };
        const res = mockRes();
        let called = false;

        requireRole('admin')(req, res, () => { called = true; });
        assert.strictEqual(called, true);

        called = false;
        requireRole('mod')(req, res, () => { called = true; });
        assert.strictEqual(called, true);

        called = false;
        requireRole('viewer')(req, res, () => { called = true; });
        assert.strictEqual(called, true);
    });

    test('requireRole allows mod for mod and viewer requirements, but denies for admin', () => {
        const req = { user: { userId: '2', role: 'mod' } };
        let res = mockRes();
        let called = false;

        requireRole(['admin', 'mod'])(req, res, () => { called = true; });
        assert.strictEqual(called, true);

        called = false;
        requireRole('viewer')(req, res, () => { called = true; });
        assert.strictEqual(called, true);

        called = false;
        res = mockRes();
        requireRole('admin')(req, res, () => { called = true; });
        assert.strictEqual(called, false);
        assert.strictEqual(res.statusCode, 403);
    });

    test('requireRole allows viewer only for viewer, denies for mod or admin', () => {
        const req = { user: { userId: '3', role: 'viewer' } };
        let res = mockRes();
        let called = false;

        requireRole('viewer')(req, res, () => { called = true; });
        assert.strictEqual(called, true);

        called = false;
        res = mockRes();
        requireRole(['admin', 'mod'])(req, res, () => { called = true; });
        assert.strictEqual(called, false);
        assert.strictEqual(res.statusCode, 403);
    });

    test('requireRole denies unauthenticated request with 401', () => {
        const req = { user: null };
        const res = mockRes();
        let called = false;

        requireRole('viewer')(req, res, () => { called = true; });
        assert.strictEqual(called, false);
        assert.strictEqual(res.statusCode, 401);
    });

    test('getClientIp extracts IP from various headers and fallbacks', () => {
        assert.strictEqual(getClientIp({ ip: '1.2.3.4' }), '1.2.3.4');
        assert.strictEqual(getClientIp({ headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' } }), '5.6.7.8');
        assert.strictEqual(getClientIp({ socket: { remoteAddress: '9.10.11.12' } }), '9.10.11.12');
        assert.strictEqual(getClientIp(null), '127.0.0.1');
    });
});
