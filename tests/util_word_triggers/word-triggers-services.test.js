/**
 * Tests for the WordTriggerService (Phase 9.2 du split util_word_triggers)
 *
 * Couvre :
 *  - create : validation des champs
 *  - get / list / delete
 *  - findMatching : match exact, contains, regex
 *  - shouldFire : cooldown, exclusions channel/role
 *  - incrementCooldown
 *  - loadCache
 */

import { test, describe } from 'vitest';
import assert from 'node:assert';
const { WordTriggerService } = require('../../src/modules/util_word_triggers/services/word-trigger.service.js');

function makeService({ repo } = {}) {
    return new WordTriggerService(repo || makeMockRepo());
}

function makeMockRepo() {
    const triggers = new Map();
    const cooldowns = new Map();
    return {
        async insertTrigger(t) {
            const id = t.id || `wt_${triggers.size + 1}`;
            const row = { ...t, id };
            triggers.set(id, row);
            return row;
        },
        async getTrigger(id) { return triggers.get(id) || null; },
        async listTriggers(guildId) {
            return [...triggers.values()].filter(t => t.guildId === guildId);
        },
        async deleteTrigger(id) { return triggers.delete(id); },
        async findMatchingTriggers(guildId, content) {
            return [...triggers.values()].filter(t => t.guildId === guildId).filter(t => {
                return t.triggerText && content.toLowerCase().includes(t.triggerText.toLowerCase());
            });
        },
        async incrementTriggerCooldown(id) {
            cooldowns.set(id, Date.now());
        }
    };
}

describe('WordTriggerService', () => {
    describe('create', () => {
        test('rejette sans guildId ou triggerText', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r = await svc.create({});
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'missing_params');
        });

        test('accepte regex matchType valide', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r = await svc.create({ guildId: 'g1', triggerText: '^ping.*', matchType: 'regex', responseText: 'A' });
            assert.strictEqual(r.ok, true);
        });

        test('rejette sans responseText ni responseEmbed', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r = await svc.create({ guildId: 'g1', triggerText: 'a' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'response_required');
        });

        test('crée un trigger avec matchType exact par défaut', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.create({ guildId: 'g1', triggerText: 'hello', responseText: 'hi back' });
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.data.matchType, 'exact');
            assert.strictEqual(r.data.guildId, 'g1');
        });
    });

    describe('get / list / delete', () => {
        test('get retourne par id', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.create({ guildId: 'g1', triggerText: 'a', responseText: 'A' });
            const fetched = await svc.get(r.data.id);
            assert.ok(fetched);
        });

        test('list filtre par guildId', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await repo.insertTrigger({ guildId: 'g1', triggerText: 'a', responseText: 'A' });
            await repo.insertTrigger({ guildId: 'g1', triggerText: 'b', responseText: 'B' });
            await repo.insertTrigger({ guildId: 'g2', triggerText: 'c', responseText: 'C' });

            const g1List = await svc.list('g1');
            assert.strictEqual(g1List.length, 2);
        });

        test('delete supprime', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const t = await repo.insertTrigger({ guildId: 'g1', triggerText: 'a', responseText: 'A' });
            const res = await svc.delete(t.id);
            assert.strictEqual(res.ok, true);
        });
    });

    describe('findMatching', () => {
        test('match contains par défaut', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await repo.insertTrigger({ guildId: 'g1', triggerText: 'hello', responseText: 'Hi', matchType: 'contains' });
            await svc.loadCache('g1');
            const match = await svc.findMatching('g1', 'Hello world!');
            assert.ok(match);
            assert.strictEqual(match.triggerText, 'hello');
        });

        test('case-insensitive', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await repo.insertTrigger({ guildId: 'g1', triggerText: 'BONJOUR', responseText: 'Hi', matchType: 'contains' });
            await svc.loadCache('g1');
            const match = await svc.findMatching('g1', 'bonjour comment ça va');
            assert.ok(match);
        });

        test('match exact', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await repo.insertTrigger({ guildId: 'g1', triggerText: 'hello', responseText: 'Hi', matchType: 'exact' });
            await svc.loadCache('g1');
            const m1 = await svc.findMatching('g1', 'hello');
            const m2 = await svc.findMatching('g1', 'hello world');
            assert.ok(m1, 'doit matcher la chaîne exacte');
            assert.strictEqual(m2, null, 'match exact ne matche pas les sous-strings');
        });

        test('findMatchingSync retourne le même résultat (synchrone)', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await repo.insertTrigger({ guildId: 'g1', triggerText: 'salut', responseText: 'Hey', matchType: 'contains' });
            await svc.loadCache('g1');
            const match = svc.findMatchingSync('g1', 'Salut à tous');
            assert.ok(match);
        });
    });

    describe('shouldFire (cooldown + exclusions)', () => {
        test('OK si pas de cooldown', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const t = { id: 'wt1', guildId: 'g1', cooldownSeconds: 5 };
            const r = svc.shouldFire(t, {}, { id: 'm1' });
            assert.strictEqual(r.ok, true);
        });

        test('refuse si en cooldown', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const t = { id: 'wt1', guildId: 'g1', cooldownSeconds: 60 };
            svc.incrementCooldown(t);
            const r = svc.shouldFire(t, {}, { id: 'm1' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.reason, 'cooldown');
        });

        test('respecte les exclusions de channel', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const t = { id: 'wt1', guildId: 'g1', cooldownSeconds: 0, excludeChannelIds: ['c-forbidden'] };
            const r = svc.shouldFire(t, { channelId: 'c-forbidden' }, { id: 'm1' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.reason, 'channel_excluded');
        });

        test('respecte les exclusions de role', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const t = { id: 'wt1', guildId: 'g1', cooldownSeconds: 0, excludeRoleIds: ['role-bad'] };
            const r = svc.shouldFire(
                t,
                {},
                { id: 'm1', roles: { cache: new Map([['role-bad', {}]]) } }
            );
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.reason, 'role_excluded');
        });
    });

    describe('incrementCooldown', () => {
        test('marque le trigger en cooldown', () => {
            const svc = makeService({ repo: makeMockRepo() });
            const t = { id: 'wt1', guildId: 'g1', cooldownSeconds: 60 };
            svc.incrementCooldown(t);
            const r = svc.shouldFire(t, {}, { id: 'm1' });
            assert.strictEqual(r.ok, false);
        });
    });

    describe('loadCache', () => {
        test('charge les triggers d\'une guilde', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await repo.insertTrigger({ guildId: 'g1', triggerText: 'a', responseText: 'A', matchType: 'contains' });
            await repo.insertTrigger({ guildId: 'g1', triggerText: 'b', responseText: 'B', matchType: 'contains' });
            await repo.insertTrigger({ guildId: 'g2', triggerText: 'c', responseText: 'C', matchType: 'contains' });

            const list = await svc.loadCache('g1');
            assert.strictEqual(list.length, 2);
            const matches = svc.findMatchingSync('g1', 'a');
            assert.ok(matches);
        });
    });
});
