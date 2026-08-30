const assert = require('node:assert');
const express = require('express');
const fs = require('fs');
const path = require('path');

describe('/api/config/:guildId/:feature endpoint tests', () => {
    let app, server, baseUrl;
    const testGuildId = 'test_guild_cfg_999';
    const dataDir = path.resolve(__dirname, '../data');
    const guildDir = path.join(dataDir, testGuildId);

    beforeAll(async () => {
        const createConfigRouter = require('../src/web/controllers/config.controller.js');

        app = express();
        app.use(express.json());
        // Mock auth user
        app.use((req, res, next) => {
            req.user = { userId: 'admin_user', role: 'admin' };
            next();
        });
        app.use('/api', createConfigRouter());

        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}/api/config`;
    });

    afterAll(async () => {
        if (server) await new Promise((r) => server.close(r));
        // Clean test files
        if (fs.existsSync(guildDir)) {
            fs.rmSync(guildDir, { recursive: true, force: true });
        }
    });

    test('GET /:guildId/:feature returns default + example config', async () => {
        const res = await fetch(`${baseUrl}/${testGuildId}/captcha`);
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.guildId, testGuildId);
        assert.strictEqual(body.feature, 'captcha');
        assert.ok(body.data);
        assert.strictEqual(body.data.enabled, true);
    });

    test('PATCH /:guildId/:feature updates and saves to data/{guildId}/{feature}.config.yml', async () => {
        const res = await fetch(`${baseUrl}/${testGuildId}/captcha`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                enabled: false,
                captcha_timeout: 25,
                verified_role_id: '999888777'
            })
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.data.enabled, false);
        assert.strictEqual(body.data.captcha_timeout, 25);
        assert.strictEqual(body.data.verified_role_id, '999888777');

        // Check that data/{guildId}/captcha.config.yml actually exists on disk
        const targetFile = path.join(guildDir, 'captcha.config.yml');
        assert.ok(fs.existsSync(targetFile), 'Le fichier YAML doit exister dans data/' + testGuildId);

        // Fetch again to verify persistence
        const getRes = await fetch(`${baseUrl}/${testGuildId}/captcha`);
        const getBody = await getRes.json();
        assert.strictEqual(getBody.data.enabled, false);
        assert.strictEqual(getBody.data.captcha_timeout, 25);
    });

    test('GET /:feature?guild_id=... fallback works', async () => {
        const res = await fetch(`${baseUrl}/captcha?guild_id=${testGuildId}`);
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.data.captcha_timeout, 25);
    });
});
