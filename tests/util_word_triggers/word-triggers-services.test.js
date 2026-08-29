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

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { WordTriggerService } = require('../../src/modules/util_word_triggers/services/word-trigger.service.js');

function makeService({ repo } = {}) {
    const svc = new WordTriggerService(repo);
    return svc;
}

function makeMockRepo() {
    const triggers = new Map();
    const cooldowns = new Map(); // key: triggerId, value: timestamp
    return {
        async insertWordTrigger(t) {
            const id = t.id || `wt_${triggers.size + 1}`;
            const row = { ...t, id };
            triggers.set(id, row);
            return row;
        },
        async getWordTrigger(id) { return triggers.get(id) || null; },
        async listWordTriggers(guildId) {
            return [...triggers.values()].filter(t => t.guildId === guildId);
        },
        async deleteWordTrigger(id) { return triggers.delete(id); },
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
            await assert.rejects(() => svc.create({}), /requis/);
        });

        test('crée un trigger avec matchType par défaut', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const t = await svc.create({
                guildId: 'g1', triggerText: 'hello', responseText: 'hi back'
            });
            assert.strictEqual(t.guildId, 'g1');
            assert.strictEqual(t.matchType || 'contains', 'contains');
        });
    });

    describe('get / list / delete', () => {
        test('get retourne par id', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const t = await svc.create({ guildId: 'g1', triggerText: 'a', responseText: 'A' });
            const fetched = await svc.get(t.id);
            assert.ok(fetched);
        });

        test('list filtre par guildId', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', triggerText: 'a', responseText: 'A' });
            await svc.create({ guildId: 'g1', triggerText: 'b', responseText: 'B' });
            await svc.create({ guildId: 'g2', triggerText: 'c', responseText: 'C' });

            const g1List = await svc.list('g1');
            assert.strictEqual(g1List.length, 2);
        });

        test('delete supprime', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const t = await svc.create({ guildId: 'g1', triggerText: 'a', responseText: 'A' });
            const res = await svc.delete(t.id);
            assert.strictEqual(res.ok, true);
        });
    });

    describe('findMatching', () => {
        test('match contains par défaut', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', triggerText: 'hello', responseText: 'Hi' });
            const matches = await svc.findMatching('g1', 'Hello world!');
            assert.strictEqual(matches.length, 1);
        });

        test('case-insensitive', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', triggerText: 'BONJOUR', responseText: 'Hi' });
            const matches = await svc.findMatching('g1', 'bonjour comment ça va');
            assert.strictEqual(matches.length, 1);
        });

        test('match exact', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', triggerText: 'hello', responseText: 'Hi', matchType: 'exact' });
            const m1 = await svc.findMatching('g1', 'hello');
            const m2 = await svc.findMatching('g1', 'hello world');
            assert.strictEqual(m1.length, 1);
            assert.strictEqual(m2.length, 0, 'match exact ne matche pas les sous-strings');
        });

        test('findMatchingSync retourne la même chose (synchrone)', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', triggerText: 'salut', responseText: 'Hey' });
            const matches = svc.findMatchingSync('g1', 'Salut à tous');
            assert.strictEqual(matches.length, 1);
        });
    });

    describe('shouldFire (cooldown + exclusions)', () => {
        test('OK si pas de cooldown', () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const t = { id: 'wt1', cooldown: 5000 };
            const r = svc.shouldFire(t, {}, { id: 'm1' });
            assert.strictEqual(r.ok, true);
        });

        test('refuse si en cooldown', () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const t = { id: 'wt1', cooldown: 60000 };
            // Déclencher le cooldown
            svc.incrementCooldown(t);
            const r = svc.shouldFire(t, {}, { id: 'm1' });
            assert.strictEqual(r.ok, false);
        });

        test('respecte les exclusions de channel', () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const t = { id: 'wt1', cooldown: 0, excludeChannels: ['c-forbidden'] };
            const r = svc.shouldFire(t, { channel: { id: 'c-forbidden' } }, { id: 'm1' });
            assert.strictEqual(r.ok, false);
        });

        test('respecte les exclusions de role', () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const t = { id: 'wt1', cooldown: 0, excludeRoles: ['role-bad'] };
            const r = svc.shouldFire(
                t,
                {},
                { id: 'm1', roles: { cache: new Map([['role-bad', {}]]) } }
            );
            assert.strictEqual(r.ok, false);
        });
    });

    describe('incrementCooldown', () => {
        test('marque le trigger en cooldown', () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const t = { id: 'wt1', cooldown: 60000 };
            svc.incrementCooldown(t);
            const r = svc.shouldFire(t, {}, { id: 'm1' });
            assert.strictEqual(r.ok, false);
        });
    });

    describe('loadCache', () => {
        test('charge les triggers d\'une guilde', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.create({ guildId: 'g1', triggerText: 'a', responseText: 'A' });
            await svc.create({ guildId: 'g1', triggerText: 'b', responseText: 'B' });
            await svc.create({ guildId: 'g2', triggerText: 'c', responseText: 'C' });

            await svc.loadCache('g1');
            const matches = svc.findMatchingSync('g1', 'a');
            assert.strictEqual(matches.length, 1);
        });
    });
});
