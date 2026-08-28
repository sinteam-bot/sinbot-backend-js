/**
const { test, describe, beforeAll, afterAll, beforeEach } = require("vitest");
 * HTTP integration tests for LogsController
 *
 * On mock les services via stub pour tester le routage et la
 * sérialisation des réponses, sans dépendre de la DB.
 */

const assert = require('node:assert');
const express = require('express');

function createStubLogs() {
    return {
        list: async (params) => ({ logs: [], total: 0, page: 1, limit: 50, pages: 1, _params: params })
    };
}
function createStubStats() {
    return {
        overview: async (guildId) => ({ members: 100, messages_24h: 50, warnings_24h: 2, active_users_7d: 30, tickets_open: 1, _guildId: guildId }),
        messagesByDay: async (g, days) => [{ day: '2026-08-27', count: 10, _days: days }],
        memberGrowth: async (g, days) => [{ day: '2026-08-27', count: 3, _days: days }],
        moderationByWeek: async (g, weeks) => [{ action: 'warn', count: 5, _weeks: weeks }]
    };
}

describe('LogsController (HTTP integration)', () => {
    let app, server, baseUrl, controller;

    beforeAll(async () => {
        const { LogsController } = require('../src/modules/feature_logs/controllers/logs.controller.js');
        controller = new LogsController(createStubLogs(), createStubStats());
        app = express();
        app.use(express.json());

        app.get('/api/logs/', async (req, res) => res.json(await controller.listLogs(req)));
        app.get('/api/logs/types', async (req, res) => res.json(await controller.listTypes(req)));
        app.get('/api/stats/overview', async (req, res) => res.json(await controller.overview(req)));
        app.get('/api/stats/messages', async (req, res) => res.json(await controller.messagesByDay(req)));
        app.get('/api/stats/members', async (req, res) => res.json(await controller.memberGrowth(req)));
        app.get('/api/stats/moderation', async (req, res) => res.json(await controller.moderationStats(req)));

        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        if (server) await new Promise((r) => server.close(r));
    });

    test('GET /api/logs retourne la liste', async () => {
        const res = await fetch(`${baseUrl}/api/logs/?guild_id=test123`);
        const body = await res.json();
        assert.strictEqual(body.success, true);
        assert.deepStrictEqual(body.data.logs, []);
        assert.strictEqual(body.data._params.guildId, 'test123');
    });

    test('GET /api/logs retourne success:false sans guild_id', async () => {
        const oldEnv = process.env.GUILD_ID;
        delete process.env.GUILD_ID;
        try {
            const res = await fetch(`${baseUrl}/api/logs/`);
            const body = await res.json();
            assert.strictEqual(body.success, false);
            assert.match(body.error || '', /guild_id/);
        } finally {
            if (oldEnv) process.env.GUILD_ID = oldEnv;
        }
    });

    test('GET /api/logs filtre par event_type', async () => {
        const res = await fetch(`${baseUrl}/api/logs/?guild_id=test&event_type=member_join`);
        const body = await res.json();
        assert.strictEqual(body.data._params.eventType, 'member_join');
    });

    test('GET /api/stats/overview retourne les KPIs', async () => {
        const res = await fetch(`${baseUrl}/api/stats/overview?guild_id=g1`);
        const body = await res.json();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.data.members, 100);
        assert.strictEqual(body.data._guildId, 'g1');
    });

    test('GET /api/stats/messages accepte days', async () => {
        const res = await fetch(`${baseUrl}/api/stats/messages?guild_id=g1&days=30`);
        const body = await res.json();
        assert.strictEqual(body.data[0]._days, 30);
    });

    test('GET /api/stats/moderation retourne les actions', async () => {
        const res = await fetch(`${baseUrl}/api/stats/moderation?guild_id=g1&weeks=2`);
        const body = await res.json();
        assert.strictEqual(body.data[0]._weeks, 2);
    });
});
