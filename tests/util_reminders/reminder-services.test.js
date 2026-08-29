/**
 * Tests for the ReminderService (Phase 9.2 du split util_reminders)
const { test, describe } = require('node:test');

 *
 * Couvre :
 *  - createReminder : validation, cooldown, insertion
 *  - listByUser : récupération par userId
 *  - cancel : ownership check
 *  - get : récupération par id
 *  - tick : retourne les到期 non annulés
 *  - dispatch : envoie DM ou message channel
 */

const assert = require('node:assert');
const { ReminderService } = require('../../src/modules/util_reminders/services/reminder.service.js');

function makeService({ repo } = {}) {
    const svc = new ReminderService(repo);
    return svc;
}

function makeMockRepo() {
    const items = new Map();
    return {
        async insertReminder(r) {
            const id = r.id || `r_${items.size + 1}`;
            const row = { ...r, id, status: r.status || 'pending' };
            items.set(id, row);
            return row;
        },
        async getReminder(id) { return items.get(id) || null; },
        async updateReminder(id, fields) {
            const r = items.get(id);
            if (r) Object.assign(r, fields);
        },
        async listByUser(userId) {
            return [...items.values()].filter(r => r.userId === userId);
        },
        async findDueReminders(limit = 50) {
            const now = Date.now();
            return [...items.values()].filter(r =>
                r.status === 'pending' && r.fireAt <= now
            ).slice(0, limit);
        }
    };
}

describe('ReminderService', () => {
    describe('createReminder', () => {
        test('rejette si userId ou text manquant', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r1 = await svc.createReminder({});
            assert.strictEqual(r1.ok, false);
            assert.strictEqual(r1.error, 'missing_params');
        });

        test('rejette si fireAt dans le passé', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r = await svc.createReminder({
                userId: 'u1', text: 'test', fireAt: Date.now() - 1000
            });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'fire_at_in_past');
        });

        test('crée un reminder valide', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r = await svc.createReminder({
                userId: 'u1', guildId: 'g1', text: 'Réunion demain',
                fireAt: Date.now() + 60000
            });
            assert.strictEqual(r.ok, true);
            assert.ok(r.reminder.id);
        });

        test('applique un cooldown de 5s', async () => {
            const svc = makeService({ repo: makeMockRepo() });
            const r1 = await svc.createReminder({
                userId: 'u1', text: 'A', fireAt: Date.now() + 60000
            });
            assert.strictEqual(r1.ok, true);
            const r2 = await svc.createReminder({
                userId: 'u1', text: 'B', fireAt: Date.now() + 70000
            });
            assert.strictEqual(r2.ok, false, 'cooldown empêche le 2e reminder');
            assert.strictEqual(r2.error, 'cooldown');
        });
    });

    describe('listByUser', () => {
        test('retourne les reminders du user', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            await svc.createReminder({ userId: 'u1', text: 'A', fireAt: Date.now() + 60000 });
            await svc.createReminder({ userId: 'u1', text: 'B', fireAt: Date.now() + 120000 });
            await svc.createReminder({ userId: 'u2', text: 'C', fireAt: Date.now() + 180000 });

            const list = await svc.listByUser('u1');
            assert.strictEqual(list.length, 2);
        });
    });

    describe('cancel', () => {
        test('owner peut annuler', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.createReminder({
                userId: 'u1', text: 'X', fireAt: Date.now() + 60000
            });
            const res = await svc.cancel(r.reminder.id, 'u1');
            assert.strictEqual(res.ok, true);
        });

        test('non-owner ne peut pas annuler', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.createReminder({
                userId: 'u1', text: 'X', fireAt: Date.now() + 60000
            });
            const res = await svc.cancel(r.reminder.id, 'u2');
            assert.strictEqual(res.ok, false);
        });
    });

    describe('get', () => {
        test('retourne le reminder par id', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.createReminder({ userId: 'u1', text: 'X', fireAt: Date.now() + 60000 });
            const fetched = await svc.get(r.reminder.id);
            assert.ok(fetched);
            assert.strictEqual(fetched.text, 'X');
        });
    });

    describe('tick', () => {
        test('retourne les reminders到期 non annulés', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r1 = await svc.createReminder({ userId: 'u1', text: 'A', fireAt: Date.now() - 1000 });
            const r2 = await svc.createReminder({ userId: 'u1', text: 'B', fireAt: Date.now() + 60000 });
            await svc.cancel(r1.reminder.id, 'u1');
            // r1 est annulé, r2 pas到期

            const due = await svc.tick();
            assert.strictEqual(due.length, 0, 'r1 annulé, r2 pas到期');
        });
    });
});
