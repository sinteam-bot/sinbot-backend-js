/**
 * Tests for the ReminderService (Phase 9.2 du split util_reminders)
 *
 * Couvre : createReminder, listByUser, cancel, get, tick, dispatch
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { ReminderService } = require('../../src/modules/util_reminders/services/reminder.service.js');

function makeService({ repo } = {}) {
    return new ReminderService(repo || makeMockRepo());
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
        async listReminders({ userId, status, limit } = {}) {
            let arr = [...items.values()].filter(r => r.userId === userId);
            if (status) arr = arr.filter(r => r.status === status);
            return limit ? arr.slice(0, limit) : arr;
        },
        async listDueReminders(limit = 50) {
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
            assert.ok(r.data.id);
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
            assert.strictEqual(r2.ok, false);
            assert.strictEqual(r2.error, 'cooldown');
        });
    });

    describe('listByUser', () => {
        test('retourne les reminders du user', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            // Bypass cooldown : insertion directe
            await repo.insertReminder({ id: 'r_1', userId: 'u1', reminderText: 'A', fireAt: Date.now() + 60000, status: 'pending' });
            await repo.insertReminder({ id: 'r_2', userId: 'u1', reminderText: 'B', fireAt: Date.now() + 120000, status: 'pending' });
            await repo.insertReminder({ id: 'r_3', userId: 'u2', reminderText: 'C', fireAt: Date.now() + 180000, status: 'pending' });
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
            const res = await svc.cancel(r.data.id, 'u1');
            assert.strictEqual(res.ok, true);
        });

        test('non-owner ne peut pas annuler', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.createReminder({
                userId: 'u1', text: 'X', fireAt: Date.now() + 60000
            });
            const res = await svc.cancel(r.data.id, 'u2');
            assert.strictEqual(res.ok, false);
        });
    });

    describe('get', () => {
        test('retourne le reminder par id', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.createReminder({ userId: 'u1', text: 'X', fireAt: Date.now() + 60000 });
            const fetched = await svc.get(r.data.id);
            assert.ok(fetched);
            assert.strictEqual(fetched.reminderText, 'X');
        });
    });

    describe('tick', () => {
        test('retourne les reminders到期 non annulés', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            // Bypass createReminder validation : insérer directement en repo
            await repo.insertReminder({ id: 'past1', userId: 'u1', reminderText: 'A', fireAt: Date.now() - 1000, status: 'pending' });
            await repo.insertReminder({ id: 'future1', userId: 'u1', reminderText: 'B', fireAt: Date.now() + 60000, status: 'pending' });
            await repo.updateReminder('past1', { status: 'cancelled' });
            const due = await svc.tick();
            assert.strictEqual(due.length, 0);
        });
    });
});
