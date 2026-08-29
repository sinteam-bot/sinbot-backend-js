/**
 * Tests for the engagement-advanced services (Phase 11.6)
 *
 * ReminderService / WordTriggerService / CustomCommandService
 * sont testés en isolation (sans discord.js).
 */

const assert = require('node:assert');
const { ReminderService } = require('../src/modules/util_reminders/services/reminder.service.js');
const { WordTriggerService } = require('../src/modules/util_reminders/services/word-trigger.service.js');
const { CustomCommandService } = require('../src/modules/util_reminders/services/custom-command.service.js');

/**
 * FakeRepo unifié pour les 3 services.
 */
class FakeRepo {
    constructor() {
        this.reminders = new Map();
        this.triggers = new Map();
        this.customCommands = new Map();
    }
    async insertReminder(r) {
        const id = r.id || 'r' + Math.random();
        const rem = {
            id,
            userId: r.userId,
            reminderText: r.reminderText || r.text,
            fireAt: r.fireAt,
            status: r.status || 'pending',
            createdAt: r.createdAt || Date.now()
        };
        this.reminders.set(id, rem);
        return rem;
    }
    async updateReminder(id, fields) {
        const r = this.reminders.get(id);
        if (r) Object.assign(r, fields);
    }
    async getReminder(id) { return this.reminders.get(id) || null; }
    async listReminders({ userId, status, limit = 50 } = {}) {
        return [...this.reminders.values()].filter(r =>
            (!userId || r.userId === userId) && (!status || r.status === status)
        ).slice(0, limit);
    }
    async listDueReminders(limit = 50) {
        const now = Date.now();
        return [...this.reminders.values()].filter(r => r.status === 'pending' && r.fireAt <= now).slice(0, limit);
    }
    async deleteReminder(id) { this.reminders.delete(id); }

    async insertTrigger(t) {
        const id = t.id || 't' + Math.random();
        const tr = {
            id,
            guildId: t.guildId,
            triggerText: t.triggerText,
            matchType: t.matchType || 'exact',
            responseText: t.responseText || null,
            responseEmbed: t.responseEmbed || null,
            excludeChannelIds: t.excludeChannelIds || [],
            excludeRoleIds: t.excludeRoleIds || [],
            cooldownSeconds: t.cooldownSeconds ?? 10,
            createdBy: t.createdBy || null,
            createdAt: t.createdAt || Date.now()
        };
        this.triggers.set(id, tr);
        return tr;
    }
    async getTrigger(id) { return this.triggers.get(id) || null; }
    async listTriggers(guildId, limit = 100) {
        return [...this.triggers.values()].filter(t => t.guildId === guildId).slice(0, limit);
    }
    async deleteTrigger(id) { this.triggers.delete(id); }

    async insertCustomCommand(c) {
        const id = c.id || 'c' + Math.random();
        const parseArr = (v) => Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : []);
        const cmd = {
            id,
            guildId: c.guildId,
            name: c.name,
            responseText: c.responseText || null,
            responseEmbed: c.responseEmbed || (c.responseEmbedJson ? JSON.parse(c.responseEmbedJson) : null),
            restrictChannelIds: parseArr(c.restrictChannelIds || c.restrictChannelIdsJson),
            restrictRoleIds: parseArr(c.restrictRoleIds || c.restrictRoleIdsJson),
            cooldownSeconds: c.cooldownSeconds ?? 5,
            createdBy: c.createdBy || null,
            createdAt: c.createdAt || Date.now()
        };
        this.customCommands.set(id, cmd);
        return cmd;
    }
    async getCustomCommand(id) { return this.customCommands.get(id) || null; }
    async getCustomCommandByName(guildId, name) {
        const lc = name.toLowerCase();
        return [...this.customCommands.values()].find(c => c.guildId === guildId && c.name === lc) || null;
    }
    async listCustomCommands(guildId, limit = 100) {
        return [...this.customCommands.values()].filter(c => c.guildId === guildId).slice(0, limit);
    }
    async deleteCustomCommand(id) { this.customCommands.delete(id); }
}

function makeMember(roles = []) {
    return {
        id: 'u1',
        user: { id: 'u1', bot: false },
        roles: {
            cache: new Map(roles.map(r => [r.id, r]))
        }
    };
}

// =================== REMINDER ===================

describe('ReminderService', () => {
    let svc, repo;
    beforeEach(() => { repo = new FakeRepo(); svc = new ReminderService(repo); });

    test('createReminder crée avec fireAt futur', async () => {
        const r = await svc.createReminder({ userId: 'u1', text: 'hello', fireAt: Date.now() + 60000 });
        assert.strictEqual(r.ok, true);
        assert.ok(r.data.id);
        assert.strictEqual(r.data.userId, 'u1');
        assert.strictEqual(r.data.reminderText, 'hello');
    });

    test('createReminder refuse fireAt passé', async () => {
        const r = await svc.createReminder({ userId: 'u1', text: 'hello', fireAt: Date.now() - 1000 });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'fire_at_in_past');
    });

    test('createReminder refuse params manquants', async () => {
        const r = await svc.createReminder({ userId: 'u1' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'missing_params');
    });

    test('tick marque到期 done', async () => {
        // On insère directement via le fakeRepo car le service refuse les fireAt dans le passé
        const fireAt = Date.now() - 1000;
        await repo.insertReminder({ userId: 'u1', reminderText: 't1', fireAt, createdAt: fireAt - 1000 });
        const due = await svc.tick();
        assert.strictEqual(due.length, 1);
        assert.strictEqual(due[0].status, 'done');
    });

    test('tick ignore les rappels futurs', async () => {
        await svc.createReminder({ userId: 'u1', text: 'future', fireAt: Date.now() + 60000 });
        const due = await svc.tick();
        assert.strictEqual(due.length, 0);
    });

    test('cancel refuse si owner different', async () => {
        const r1 = await svc.createReminder({ userId: 'u1', text: 't', fireAt: Date.now() + 60000 });
        const r2 = await svc.cancel(r1.data.id, 'u2');
        assert.strictEqual(r2.ok, false);
        assert.strictEqual(r2.error, 'not_owner');
    });

    test('cancel accepte si owner', async () => {
        const r1 = await svc.createReminder({ userId: 'u1', text: 't', fireAt: Date.now() + 60000 });
        const r2 = await svc.cancel(r1.data.id, 'u1');
        assert.strictEqual(r2.ok, true);
    });

    test('listByUser filtre par userId', async () => {
        await svc.createReminder({ userId: 'u1', text: 'a', fireAt: Date.now() + 60000 });
        await svc.createReminder({ userId: 'u2', text: 'b', fireAt: Date.now() + 60000 });
        const list = await svc.listByUser('u1');
        assert.strictEqual(list.length, 1);
        assert.strictEqual(list[0].userId, 'u1');
    });

    test('createReminder tronque le texte > 500 chars', async () => {
        const long = 'x'.repeat(600);
        const r = await svc.createReminder({ userId: 'u1', text: long, fireAt: Date.now() + 60000 });
        assert.strictEqual(r.data.reminderText.length, 500);
    });
});

// =================== WORD TRIGGER ===================

describe('WordTriggerService', () => {
    let svc, repo;
    beforeEach(() => { repo = new FakeRepo(); svc = new WordTriggerService(repo); });

    test('create avec match=exact', async () => {
        const r = await svc.create({ guildId: 'g1', triggerText: 'ping', responseText: 'pong', matchType: 'exact', createdBy: 'u1' });
        assert.strictEqual(r.ok, true);
    });

    test('create refuse sans réponse', async () => {
        const r = await svc.create({ guildId: 'g1', triggerText: 'ping', matchType: 'exact' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'response_required');
    });

    test('create refuse regex en V1', async () => {
        const r = await svc.create({ guildId: 'g1', triggerText: 'p..g', responseText: 'pong', matchType: 'regex' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'regex_not_supported_yet');
    });

    test('findMatching exact match', async () => {
        const t = { id: 't1', guildId: 'g1', triggerText: 'ping', matchType: 'exact', cooldownSeconds: 0, excludeChannelIds: [], excludeRoleIds: [] };
        svc._cache = new Map([['g1', [t]]]);
        assert.strictEqual(svc.findMatchingSync('g1', 'ping'), t);
        assert.strictEqual(svc.findMatchingSync('g1', 'PING'), t); // case-insensitive
        assert.strictEqual(svc.findMatchingSync('g1', 'hello'), null);
    });

    test('findMatching contains match', () => {
        const t = { id: 't1', guildId: 'g1', triggerText: 'pizza', matchType: 'contains', cooldownSeconds: 0, excludeChannelIds: [], excludeRoleIds: [] };
        svc._cache = new Map([['g1', [t]]]);
        assert.strictEqual(svc.findMatchingSync('g1', 'je veux une pizza'), t);
        assert.strictEqual(svc.findMatchingSync('g1', 'PIZZA time'), t);
        assert.strictEqual(svc.findMatchingSync('g1', 'burger'), null);
    });

    test('shouldFire respecte cooldown', () => {
        const t = { id: 't1', guildId: 'g1', triggerText: 'x', cooldownSeconds: 5, excludeChannelIds: [], excludeRoleIds: [] };
        const m = makeMember();
        const msg = { channelId: 'c1' };
        assert.strictEqual(svc.shouldFire(t, msg, m).ok, true);
        svc.incrementCooldown(t);
        assert.strictEqual(svc.shouldFire(t, msg, m).ok, false);
        assert.strictEqual(svc.shouldFire(t, msg, m).reason, 'cooldown');
    });

    test('shouldFire respecte channel excludes', () => {
        const t = { id: 't1', guildId: 'g1', triggerText: 'x', cooldownSeconds: 0, excludeChannelIds: ['c1'], excludeRoleIds: [] };
        const msg = { channelId: 'c1' };
        const r = svc.shouldFire(t, msg, makeMember());
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'channel_excluded');
    });

    test('shouldFire respecte role excludes', () => {
        const t = { id: 't1', guildId: 'g1', triggerText: 'x', cooldownSeconds: 0, excludeChannelIds: [], excludeRoleIds: ['r1'] };
        const m = makeMember([{ id: 'r1' }]);
        const r = svc.shouldFire(t, { channelId: 'c1' }, m);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'role_excluded');
    });

    test('delete supprime le trigger', async () => {
        const r1 = await svc.create({ guildId: 'g1', triggerText: 'x', responseText: 'y' });
        const r2 = await svc.delete(r1.data.id);
        assert.strictEqual(r2.ok, true);
        const g = await svc.get(r1.data.id);
        assert.strictEqual(g, null);
    });
});

// =================== CUSTOM COMMAND ===================

describe('CustomCommandService', () => {
    let svc, repo;
    beforeEach(() => { repo = new FakeRepo(); svc = new CustomCommandService(repo); });

    test('create avec responseText', async () => {
        const r = await svc.create({ guildId: 'g1', name: 'bienvenue', responseText: 'Salut !' });
        assert.strictEqual(r.ok, true);
    });

    test('create refuse nom pris', async () => {
        await svc.create({ guildId: 'g1', name: 'bienvenue', responseText: 'a' });
        const r = await svc.create({ guildId: 'g1', name: 'BIENVENUE', responseText: 'b' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'name_taken');
    });

    test('create refuse sans réponse', async () => {
        const r = await svc.create({ guildId: 'g1', name: 'foo' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'response_required');
    });

    test('create refuse nom trop long', async () => {
        const r = await svc.create({ guildId: 'g1', name: 'a'.repeat(40), responseText: 'x' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'invalid_name');
    });

    test('find par nom (lowercase)', async () => {
        await svc.create({ guildId: 'g1', name: 'PING', responseText: 'pong' });
        const c = await svc.find('g1', 'ping');
        assert.ok(c);
        assert.strictEqual(c.name, 'ping');
    });

    test('canRun check channels/roles', async () => {
        const cmd = await svc.create({ guildId: 'g1', name: 'x', responseText: 'y', restrictChannelIds: ['c2'], restrictRoleIds: ['r1'], cooldown: 0 });
        // Reset cooldown interne (le service ajoute un cooldown à la création)
        svc._cooldowns.clear();

        // Bon channel + bon role
        let r = svc.canRun(cmd.data, { channelId: 'c2' }, makeMember([{ id: 'r1' }]));
        assert.strictEqual(r.ok, true);

        // Mauvais channel
        r = svc.canRun(cmd.data, { channelId: 'c1' }, makeMember([{ id: 'r1' }]));
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'channel_not_allowed');

        // Bon channel mais mauvais role
        r = svc.canRun(cmd.data, { channelId: 'c2' }, makeMember([{ id: 'r2' }]));
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'role_required');
    });

    test('canRun respecte cooldown', () => {
        const cmd = { id: 'c1', guildId: 'g1', name: 'x', cooldownSeconds: 5, restrictChannelIds: [], restrictRoleIds: [] };
        const msg = { channelId: 'c1' };
        assert.strictEqual(svc.canRun(cmd, msg, makeMember()).ok, true);
        svc.incrementCooldown(cmd);
        assert.strictEqual(svc.canRun(cmd, msg, makeMember()).ok, false);
    });

    test('list par guild', async () => {
        await svc.create({ guildId: 'g1', name: 'a', responseText: 'x' });
        await svc.create({ guildId: 'g2', name: 'b', responseText: 'y' });
        const list = await svc.list('g1');
        assert.strictEqual(list.length, 1);
        assert.strictEqual(list[0].name, 'a');
    });

    test('delete', async () => {
        const r1 = await svc.create({ guildId: 'g1', name: 'x', responseText: 'y' });
        await svc.delete(r1.data.id);
        const c = await svc.find('g1', 'x');
        assert.strictEqual(c, null);
    });
});
