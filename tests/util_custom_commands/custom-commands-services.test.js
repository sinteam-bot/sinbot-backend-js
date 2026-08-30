/**
 * Tests for the CustomCommandService (Phase 9.2 du split util_custom_commands)
 *
 * Couvre :
 *  - create : validation, structure retournée
 *  - get / list / find / delete
 *  - canRun : cooldown, restrictions channel/role
 *  - incrementCooldown
 *  - loadCache
 */

import { test, describe } from 'vitest';
import assert from 'node:assert';
const { CustomCommandService } = require('../../src/modules/util_custom_commands/services/custom-command.service.js');

function makeService({ repo } = {}) {
    return new CustomCommandService(repo || makeMockRepo());
}

function makeMockRepo() {
    const items = new Map();
    return {
        async insertCustomCommand(c) {
            const id = c.id || `cc_${items.size + 1}`;
            const row = { ...c, id };
            items.set(id, row);
            return row;
        },
        async getCustomCommand(id) { return items.get(id) || null; },
        async listCustomCommands(guildId) {
            return [...items.values()].filter(c => c.guildId === guildId);
        },
        async getCustomCommandByName(guildId, name) {
            return [...items.values()].find(c => c.guildId === guildId && c.name === name.toLowerCase()) || null;
        },
        async deleteCustomCommand(id) { return items.delete(id); },
        async incrementCommandCooldown(id) { /* noop */ }
    };
}

describe('CustomCommandService', () => {
    describe('create', () => {
        test('rejette sans guildId ou name', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r = await svc.create({});
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'missing_params');
        });

        test('rejette sans responseText ni responseEmbed', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r = await svc.create({ guildId: 'g1', name: 'ping' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'response_required');
        });

        test('crée une commande simple', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.create({
                guildId: 'g1', name: 'ping', responseText: 'Pong!', createdBy: 'u1'
            });
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.data.name, 'ping');
            assert.strictEqual(r.data.responseText, 'Pong!');
        });

        test('rejette nom trop long', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r = await svc.create({
                guildId: 'g1', name: 'a'.repeat(33), responseText: 'r', createdBy: 'u1'
            });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'invalid_name');
        });

        test('rejette nom déjà pris', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', name: 'ping', responseText: 'r', createdBy: 'u1' });
            const r = await svc.create({ guildId: 'g1', name: 'ping', responseText: 'r2', createdBy: 'u1' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'name_taken');
        });

        test('stocke responseEmbed en JSON string', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.create({
                guildId: 'g1', name: 'cmd', responseText: 'r',
                responseEmbed: { title: 'hi', description: 'x' },
                createdBy: 'u1'
            });
            assert.strictEqual(r.ok, true);
            assert.strictEqual(typeof r.data.responseEmbedJson, 'string');
            assert.deepStrictEqual(JSON.parse(r.data.responseEmbedJson), { title: 'hi', description: 'x' });
        });

        test('stocke restrictChannelIds en JSON string', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.create({
                guildId: 'g1', name: 'cmd', responseText: 'r',
                restrictChannelIds: ['c1', 'c2'],
                createdBy: 'u1'
            });
            assert.strictEqual(r.ok, true);
            assert.strictEqual(typeof r.data.restrictChannelIdsJson, 'string');
            assert.deepStrictEqual(JSON.parse(r.data.restrictChannelIdsJson), ['c1', 'c2']);
        });

        test('stocke restrictRoleIds en JSON string', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.create({
                guildId: 'g1', name: 'cmd', responseText: 'r',
                restrictRoleIds: ['role1'],
                createdBy: 'u1'
            });
            assert.strictEqual(r.ok, true);
            assert.strictEqual(typeof r.data.restrictRoleIdsJson, 'string');
            assert.deepStrictEqual(JSON.parse(r.data.restrictRoleIdsJson), ['role1']);
        });
    });

    describe('get / list / find / delete', () => {
        test('get retourne par id', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.create({ guildId: 'g1', name: 'cmd', responseText: 'r', createdBy: 'u1' });
            const fetched = await svc.get(r.data.id);
            assert.ok(fetched);
        });

        test('list filtre par guildId', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await repo.insertCustomCommand({ guildId: 'g1', name: 'a', responseText: 'r' });
            await repo.insertCustomCommand({ guildId: 'g1', name: 'b', responseText: 'r' });
            await repo.insertCustomCommand({ guildId: 'g2', name: 'c', responseText: 'r' });

            const list = await svc.list('g1');
            assert.strictEqual(list.length, 2);
        });

        test('find par (guildId, name)', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await repo.insertCustomCommand({ guildId: 'g1', name: 'ping', responseText: 'r' });
            const found = await svc.find('g1', 'ping');
            assert.ok(found);
        });

        test('delete supprime', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = await repo.insertCustomCommand({ guildId: 'g1', name: 'cmd', responseText: 'r' });
            const r = await svc.delete(c.id);
            assert.strictEqual(r.ok, true);
        });
    });

    describe('canRun', () => {
        test('OK sans restriction', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const c = { guildId: 'g1', name: 'cmd' };
            const r = svc.canRun(c, { channelId: 'c1' }, { id: 'u1' });
            assert.strictEqual(r.ok, true);
        });

        test('refuse si channel restreint non matché', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const c = { guildId: 'g1', name: 'cmd', restrictChannelIds: ['c-allowed'] };
            const r = svc.canRun(c, { channelId: 'c-other' }, { id: 'u1' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.reason, 'channel_not_allowed');
        });

        test('refuse si role restreint manquant', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const c = { guildId: 'g1', name: 'cmd', restrictRoleIds: ['role-bad'] };
            const r = svc.canRun(
                c,
                { channelId: 'c1' },
                { id: 'u1', roles: { cache: new Map() } }
            );
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.reason, 'role_required');
        });

        test('refuse en cooldown', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const c = { id: 'cc1', guildId: 'g1', name: 'cmd', cooldownSeconds: 60 };
            svc.incrementCooldown(c);
            const r = svc.canRun(c, { channelId: 'c1' }, { id: 'u1' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.reason, 'cooldown');
        });

        test('OK si pas de cooldown et pas de restriction', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const c = { guildId: 'g1', name: 'cmd', cooldownSeconds: 0 };
            const r = svc.canRun(c, { channelId: 'c1' }, { id: 'u1' });
            assert.strictEqual(r.ok, true);
        });
    });

    describe('incrementCooldown', () => {
        test('marque le cooldown', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const c = { guildId: 'g1', name: 'cmd', cooldownSeconds: 60 };
            svc.incrementCooldown(c);
            const r = svc.canRun(c, { channelId: 'c1' }, { id: 'u1' });
            assert.strictEqual(r.ok, false);
        });
    });

    describe('loadCache', () => {
        test('charge les commandes d\'une guilde', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await repo.insertCustomCommand({ guildId: 'g1', name: 'ping', responseText: 'Pong!' });
            await repo.insertCustomCommand({ guildId: 'g1', name: 'pong', responseText: 'Ping!' });
            await repo.insertCustomCommand({ guildId: 'g2', name: 'hello', responseText: 'Hi!' });

            const list = await svc.loadCache('g1');
            assert.strictEqual(list.length, 2);
            const found = await svc.find('g1', 'ping');
            assert.ok(found);
        });
    });
});
