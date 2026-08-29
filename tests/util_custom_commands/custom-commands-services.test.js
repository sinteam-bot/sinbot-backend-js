/**
 * Tests for the CustomCommandService (Phase 9.2 du split util_custom_commands)
 *
 * Couvre :
 *  - create : validation, parse des champs (responseEmbed JSON, restrictChannelIds/RoleIds strings)
 *  - get / list / find / delete
 *  - canRun : cooldown, restrictions channel/role
 *  - incrementCooldown
 *  - loadCache
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { CustomCommandService } = require('../../src/modules/util_custom_commands/services/custom-command.service.js');

function makeService({ repo } = {}) {
    const svc = new CustomCommandService(repo);
    return svc;
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
        async findCustomCommand(guildId, name) {
            return [...items.values()].find(c => c.guildId === guildId && c.name === name) || null;
        },
        async deleteCustomCommand(id) { return items.delete(id); },
        async incrementCommandCooldown(id) { /* noop */ }
    };
}

describe('CustomCommandService', () => {
    describe('create', () => {
        test('rejette sans champs requis', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            await assert.rejects(() => svc.create({}), /requis/);
        });

        test('crée une commande simple', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = await svc.create({
                guildId: 'g1', name: 'ping', responseText: 'Pong!', createdBy: 'u1'
            });
            assert.strictEqual(c.name, 'ping');
            assert.strictEqual(c.responseText, 'Pong!');
        });

        test('parse responseEmbed si string JSON', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = await svc.create({
                guildId: 'g1', name: 'cmd',
                responseText: 'r',
                responseEmbed: '{"title":"hi","description":"x"}',
                createdBy: 'u1'
            });
            assert.deepStrictEqual(c.responseEmbed, { title: 'hi', description: 'x' });
        });

        test('parse restrictChannelIds si string', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = await svc.create({
                guildId: 'g1', name: 'cmd',
                responseText: 'r',
                restrictChannelIds: '["c1","c2"]',
                createdBy: 'u1'
            });
            assert.deepStrictEqual(c.restrictChannelIds, ['c1', 'c2']);
        });

        test('parse restrictRoleIds si string', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = await svc.create({
                guildId: 'g1', name: 'cmd',
                responseText: 'r',
                restrictRoleIds: '["role1"]',
                createdBy: 'u1'
            });
            assert.deepStrictEqual(c.restrictRoleIds, ['role1']);
        });
    });

    describe('get / list / find / delete', () => {
        test('get retourne par id', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = await svc.create({ guildId: 'g1', name: 'cmd', responseText: 'r', createdBy: 'u1' });
            const fetched = await svc.get(c.id);
            assert.ok(fetched);
        });

        test('list filtre par guildId', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', name: 'a', responseText: 'r', createdBy: 'u1' });
            await svc.create({ guildId: 'g1', name: 'b', responseText: 'r', createdBy: 'u1' });
            await svc.create({ guildId: 'g2', name: 'c', responseText: 'r', createdBy: 'u1' });
            const list = await svc.list('g1');
            assert.strictEqual(list.length, 2);
        });

        test('find par (guildId, name)', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', name: 'ping', responseText: 'r', createdBy: 'u1' });
            const found = await svc.find('g1', 'ping');
            assert.ok(found);
        });

        test('delete supprime', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = await svc.create({ guildId: 'g1', name: 'cmd', responseText: 'r', createdBy: 'u1' });
            const r = await svc.delete(c.id);
            assert.strictEqual(r.ok, true);
        });
    });

    describe('canRun', () => {
        test('OK sans restriction', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r = svc.canRun({}, { channel: {} }, { id: 'u1' });
            assert.strictEqual(r.ok, true);
        });

        test('refuse si channel restreint', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const c = { restrictChannelIds: ['c-bad'] };
            const r = svc.canRun(c, { channel: { id: 'c-bad' } }, { id: 'u1' });
            assert.strictEqual(r.ok, false);
        });

        test('refuse si role restreint', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const c = { restrictRoleIds: ['role-bad'] };
            const r = svc.canRun(
                c,
                { channel: {} },
                { id: 'u1', roles: { cache: new Map([['role-bad', {}]]) } }
            );
            assert.strictEqual(r.ok, false);
        });

        test('refuse en cooldown', () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = { id: 'cc1', cooldown: 60000 };
            svc.incrementCooldown(c);
            const r = svc.canRun(c, { channel: {} }, { id: 'u1' });
            assert.strictEqual(r.ok, false);
        });

        test('OK si pas de cooldown et pas de restriction', () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = { id: 'cc1', cooldown: 0 };
            const r = svc.canRun(c, { channel: {} }, { id: 'u1' });
            assert.strictEqual(r.ok, true);
        });
    });

    describe('incrementCooldown', () => {
        test('marque le cooldown', () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const c = { id: 'cc1', cooldown: 60000 };
            svc.incrementCooldown(c);
            const r = svc.canRun(c, { channel: {} }, { id: 'u1' });
            assert.strictEqual(r.ok, false);
        });
    });

    describe('loadCache', () => {
        test('charge les commandes d\'une guilde', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', name: 'ping', responseText: 'Pong!', createdBy: 'u1' });
            await svc.create({ guildId: 'g1', name: 'pong', responseText: 'Ping!', createdBy: 'u1' });
            await svc.create({ guildId: 'g2', name: 'hello', responseText: 'Hi!', createdBy: 'u1' });

            await svc.loadCache('g1');
            const found = await svc.find('g1', 'ping');
            assert.ok(found);
        });
    });
});
