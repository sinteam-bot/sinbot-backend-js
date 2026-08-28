/**
 * Tests for the shared InteractiveMessageBuilder (Phase 10 v2)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { InteractiveMessageBuilder } = require('../src/services/interactive-message-builder.js');

describe('InteractiveMessageBuilder', () => {
    let b;
    test('beforeEach', () => { b = new InteractiveMessageBuilder(); });

    describe('validateComponent (button)', () => {
        test('rejette sans kind', () => {
            assert.throws(() => b.validateComponent({ label: 'x', action: 'toggle_role', roleId: 'r1' }), /kind invalide/);
        });
        test('rejette sans label', () => {
            assert.throws(() => b.validateComponent({ kind: 'button', action: 'toggle_role', roleId: 'r1' }), /button\.label/);
        });
        test('rejette label trop long', () => {
            assert.throws(() => b.validateComponent({ kind: 'button', label: 'x'.repeat(81), action: 'toggle_role', roleId: 'r1' }), /button\.label trop long/);
        });
        test('rejette action invalide', () => {
            assert.throws(() => b.validateComponent({ kind: 'button', label: 'x', action: 'hack' }), /button\.action invalide/);
        });
        test('rejette roleId manquant pour toggle_role', () => {
            assert.throws(() => b.validateComponent({ kind: 'button', label: 'x', action: 'toggle_role' }), /roleId requis/);
        });
        test('rejette url manquante pour open_url', () => {
            assert.throws(() => b.validateComponent({ kind: 'button', label: 'x', action: 'open_url' }), /button\.url/);
        });
        test('rejette url non http(s)', () => {
            assert.throws(() => b.validateComponent({ kind: 'button', label: 'x', action: 'open_url', url: 'javascript:alert(1)' }), /button\.url/);
        });
        test('accepte un button toggle_role valide', () => {
            assert.doesNotThrow(() => b.validateComponent({ kind: 'button', label: 'Verify', action: 'toggle_role', roleId: 'r1' }));
        });
        test('accepte un button open_url valide', () => {
            assert.doesNotThrow(() => b.validateComponent({ kind: 'button', label: 'Doc', action: 'open_url', url: 'https://example.com' }));
        });
    });

    describe('validateComponent (select)', () => {
        test('rejette sans options', () => {
            assert.throws(() => b.validateComponent({ kind: 'select' }), /options doit/);
        });
        test('rejette options > 25', () => {
            const opts = Array.from({ length: 26 }, (_, i) => ({ label: `L${i}`, value: `v${i}` }));
            assert.throws(() => b.validateComponent({ kind: 'select', options: opts }), /trop nombreuses/);
        });
        test('rejette label vide', () => {
            assert.throws(() => b.validateComponent({ kind: 'select', options: [{ label: '', value: 'x' }] }), /label invalide/);
        });
        test('rejette description > 100', () => {
            const opts = [{ label: 'L', value: 'v', description: 'x'.repeat(101) }];
            assert.throws(() => b.validateComponent({ kind: 'select', options: opts }), /description trop longue/);
        });
        test('accepte select 1-25 options', () => {
            const opts = Array.from({ length: 25 }, (_, i) => ({ label: `L${i}`, value: `v${i}` }));
            assert.doesNotThrow(() => b.validateComponent({ kind: 'select', options: opts }));
        });
    });

    describe('buildRow / buildMessage', () => {
        test('buildRow: 1 button', () => {
            const row = b.buildRow([{ kind: 'button', label: 'OK', action: 'toggle_role', roleId: 'r1' }]);
            assert.ok(row);
        });
        test('buildRow: 5 buttons', () => {
            const comps = Array.from({ length: 5 }, (_, i) => ({ kind: 'button', label: `B${i}`, action: 'toggle_role', roleId: `r${i}` }));
            const row = b.buildRow(comps);
            assert.ok(row);
        });
        test('buildRow: 6 buttons → throw', () => {
            const comps = Array.from({ length: 6 }, (_, i) => ({ kind: 'button', label: `B${i}`, action: 'toggle_role', roleId: `r${i}` }));
            assert.throws(() => b.buildRow(comps), /Maximum 5 components/);
        });
        test('buildMessage: 25 buttons (max) en 5 rows', () => {
            const comps = Array.from({ length: 25 }, (_, i) => ({ kind: 'button', label: `B${i}`, action: 'toggle_role', roleId: `r${i}` }));
            const rows = b.buildMessage(comps);
            assert.strictEqual(rows.length, 5);
        });
        test('buildMessage: 26 buttons → throw', () => {
            const comps = Array.from({ length: 26 }, (_, i) => ({ kind: 'button', label: `B${i}`, action: 'toggle_role', roleId: `r${i}` }));
            assert.throws(() => b.buildMessage(comps), /Maximum 5 ActionRows/);
        });
        test('buildMessage: select isolé dans sa row', () => {
            const rows = b.buildMessage([
                { kind: 'button', label: 'B1', action: 'toggle_role', roleId: 'r1' },
                { kind: 'select', options: [{ label: 'A', value: 'a' }] },
                { kind: 'button', label: 'B2', action: 'toggle_role', roleId: 'r2' }
            ]);
            assert.strictEqual(rows.length, 3); // [B1] [select] [B2]
        });
    });

    describe('makeCustomId / parseCustomId', () => {
        test('makeCustomId: simple', () => {
            assert.strictEqual(b.makeCustomId('r1'), 'ir:r1');
        });
        test('makeCustomId: avec suffix', () => {
            assert.strictEqual(b.makeCustomId('r1', 'claim'), 'ir:r1:claim');
        });
        test('makeCustomId: trop long → throw', () => {
            assert.throws(() => b.makeCustomId('x'.repeat(101)), /trop long/);
        });
        test('parseCustomId: simple', () => {
            assert.deepStrictEqual(b.parseCustomId('ir:r1'), { id: 'r1', suffix: null });
        });
        test('parseCustomId: avec suffix', () => {
            assert.deepStrictEqual(b.parseCustomId('ir:r1:claim'), { id: 'r1', suffix: 'claim' });
        });
        test('parseCustomId: préfixe invalide → null', () => {
            assert.strictEqual(b.parseCustomId('other:r1'), null);
        });
    });

    describe('execute (button)', () => {
        test('button sans member → no_member', async () => {
            const r = await b.execute({ values: [] }, { kind: 'button', label: 'x', action: 'toggle_role', roleId: 'r1' }, null);
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'no_member');
        });
        test('button open_url → ok avec opened_url', async () => {
            const r = await b.execute({}, { kind: 'button', label: 'x', action: 'open_url', url: 'https://example.com' }, {});
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.message, 'opened_url');
        });
        test('toggle_role ajoute si pas présent', async () => {
            const added = [];
            const removed = [];
            const member = {
                roles: {
                    cache: { has: () => false },
                    add: async (rid) => added.push(rid),
                    remove: async (rid) => removed.push(rid)
                }
            };
            const r = await b.execute({}, { kind: 'button', label: 'x', action: 'toggle_role', roleId: 'r1' }, member);
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.action, 'added');
            assert.deepStrictEqual(added, ['r1']);
        });
        test('toggle_role retire si présent', async () => {
            const removed = [];
            const member = {
                roles: {
                    cache: { has: () => true },
                    add: async () => {},
                    remove: async (rid) => removed.push(rid)
                }
            };
            const r = await b.execute({}, { kind: 'button', label: 'x', action: 'toggle_role', roleId: 'r1' }, member);
            assert.strictEqual(r.action, 'removed');
            assert.deepStrictEqual(removed, ['r1']);
        });
        test('give_role ne double pas si déjà présent', async () => {
            const added = [];
            const member = {
                roles: {
                    cache: { has: () => true },
                    add: async (rid) => added.push(rid),
                    remove: async () => {}
                }
            };
            const r = await b.execute({}, { kind: 'button', label: 'x', action: 'give_role', roleId: 'r1' }, member);
            assert.strictEqual(r.action, 'added'); // retourne added mais ne push pas
            assert.strictEqual(added.length, 0);
        });
    });

    describe('execute (select)', () => {
        test('select avec valeurs ajoute les roles manquants', async () => {
            const added = [];
            const member = {
                roles: {
                    cache: { has: (rid) => rid === 'r2' },
                    add: async (rid) => added.push(rid),
                    remove: async () => {}
                }
            };
            const comp = {
                kind: 'select',
                options: [
                    { label: 'A', value: 'a', roleId: 'r1' },
                    { label: 'B', value: 'b', roleId: 'r2' }
                ]
            };
            const interaction = { values: ['a', 'b'] };
            const r = await b.execute(interaction, comp, member);
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.count, 1); // seul 'r1' a été ajouté
            assert.deepStrictEqual(added, ['r1']);
        });
        test('select sans sélection → no_selection', async () => {
            const r = await b.execute({ values: [] }, { kind: 'select', options: [{ label: 'A', value: 'a' }] }, {});
            assert.strictEqual(r.action, 'no_selection');
        });
        test('select avec option sans roleId → ignoré', async () => {
            const member = { roles: { cache: { has: () => false }, add: async () => {}, remove: async () => {} } };
            const r = await b.execute({ values: ['a'] }, { kind: 'select', options: [{ label: 'A', value: 'a' }] }, member);
            assert.strictEqual(r.count, 0);
        });
    });
});
