/**
const { test, describe, beforeAll, afterAll, beforeEach } = require("vitest");
 * Tests d'intégration pour featuresRouter
 *
 * On mock le FeatureRegistry via Module._cache pour qu'il utilise une instance
 * de test isolée. Cela permet de tester les routes sans dépendre de la DB
 * ni du bot Discord.
 */

const assert = require('node:assert');
const express = require('express');

describe('featuresRouter (HTTP integration)', () => {
    let app, server, baseUrl, featureRegistry, registryModule;

    beforeAll(async () => {
        registryModule = require('../src/core/feature-registry.js');
        featureRegistry = new registryModule.FeatureRegistry();
        featureRegistry._dbAvailable = false;

        featureRegistry.define('test_feat_a', { defaults: { enabled: false, foo: 'bar' } });
        featureRegistry.define('test_feat_b', { defaults: { enabled: true, count: 3 } });

        const origModule = require.cache[require.resolve('../src/core/feature-registry.js')];
        const origExports = origModule.exports;
        origModule.exports = { ...origExports, featureRegistry };

        const createRouter = require('../src/web/featuresRouter.js');

        app = express();
        app.use(express.json());
        app.use('/api/features', createRouter());

        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}/api/features`;

        return async () => {
            origModule.exports = origExports;
        };
    });

    afterAll(async () => {
        if (server) await new Promise((r) => server.close(r));
    });

    test('GET / liste les features avec leur état', async () => {
        const res = await fetch(`${baseUrl}?guild_id=g1`);
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.success, true);
        assert.ok(Array.isArray(body.data));
        assert.strictEqual(body.data.length, 2);
    });

    test('GET /:name retourne l\'état détaillé', async () => {
        const res = await fetch(`${baseUrl}/test_feat_a?guild_id=g1`);
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.data.name, 'test_feat_a');
        assert.strictEqual(body.data.enabled, false);
        assert.strictEqual(body.data.config.foo, 'bar');
    });

    test('GET / retourne 400 si guildId manquant', async () => {
        const oldEnv = process.env.GUILD_ID;
        delete process.env.GUILD_ID;
        try {
            const res = await fetch(`${baseUrl}`);
            const body = await res.json();
            assert.strictEqual(res.status, 400);
            assert.match(body.error || '', /guildId/);
        } finally {
            if (oldEnv) process.env.GUILD_ID = oldEnv;
        }
    });

    test('PATCH /:name toggle on/off', async () => {
        const res = await fetch(`${baseUrl}/test_feat_a?guild_id=g1`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.data.enabled, true);
    });

    test('PATCH /:name 404 si feature inconnue', async () => {
        const res = await fetch(`${baseUrl}/does_not_exist?guild_id=g1`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        });
        assert.strictEqual(res.status, 404);
    });
});
