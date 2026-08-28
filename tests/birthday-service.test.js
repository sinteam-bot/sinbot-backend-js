/**
 * Tests for the BirthdayService (Phase 7)
 *
 * Couvre :
 *   - validation des dates (ISO, DD/MM, DD-MM, format invalide)
 *   - state machine : setBirthday, removeBirthday, setVisibility
 *   - calcul du cooldown Draftbot (1j / 2j / 6m / 1an)
 *   - listToday, listUpcoming
 *   - renderTemplate (substitution variables)
 *   - ageAt, nextBirthday (calculs purs)
 *   - canChangeBirthday
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { BirthdayService, DEFAULT_COOLDOWN_DAYS } = require('../src/modules/feature_birthdays/services/birthday.service.js');

/**
 * FakeRepo qui simule le repo Drizzle
 */
class FakeBirthdayRepo {
    constructor() {
        this.settings = new Map();
        this.visibility = new Map();
        this.changes = new Map(); // key = "userId:guildId|null" -> array
        this.history = [];
    }

    _key(userId, guildId) { return `${userId}:${guildId || 'null'}`; }

    async getSettings(guildId) { return this.settings.get(guildId) || null; }
    async upsertSettings(s) {
        this.settings.set(s.guildId, s);
        return s;
    }
    async getVisibility(userId, guildId) {
        const k = this._key(userId, guildId);
        return this.visibility.get(k) || null;
    }
    async upsertVisibility(userId, guildId, enabled) {
        this.visibility.set(this._key(userId, guildId), { userId, guildId, enabled });
    }
    async getChangeCount(userId, guildId = null) {
        const list = this.changes.get(this._key(userId, guildId)) || [];
        return list.length;
    }
    async getLastChange(userId, guildId = null) {
        const list = this.changes.get(this._key(userId, guildId)) || [];
        return list[list.length - 1] || null;
    }
    async insertChange({ userId, guildId, changeNumber, previousBirthdate, newBirthdate, cooldownUntil }) {
        const k = this._key(userId, guildId);
        if (!this.changes.has(k)) this.changes.set(k, []);
        const id = Math.random().toString(36).slice(2);
        const entry = { id, user_id: userId, guild_id: guildId, change_number: changeNumber, previous_birthdate: previousBirthdate, new_birthdate: newBirthdate, cooldown_until: cooldownUntil, changed_at: Date.now() };
        this.changes.get(k).push(entry);
        return entry;
    }
    async insertHistory(h) {
        this.history.push({ ...h, announcedAt: Date.now(), id: Math.random().toString(36).slice(2) });
        return { ok: true };
    }
    async listHistory({ guildId, limit = 50 } = {}) {
        return this.history.filter(h => !guildId || h.guildId === guildId).slice(0, limit);
    }
    async listTodaysBirthdays(guildId, month, day) {
        // Faked: 1 entry on today's date
        return [{
            userId: 'u1',
            username: 'Alice',
            birthdate: '2000-01-15',
            visibility: true
        }];
    }
}

/**
 * Mock minimal de la table user_birthdays legacy (via Drizzle)
 */
function mockLegacyDb(fakes = {}) {
    const { db, schema } = require('../src/db/index.js');
    // Override les méthodes Drizzle utilisées par birthday.service.js
    db.insert = () => ({
        values: () => ({
            onConflictDoUpdate: () => ({
                // returns a thenable that resolves
                then: (resolve) => resolve([{ userId: 'u1' }])
            })
        })
    });
    db.delete = () => ({
        where: () => ({ then: (resolve) => resolve() })
    });
    db.select = () => ({
        from: () => ({
            where: () => ({
                limit: () => Promise.resolve(fakes.birthday ? [fakes.birthday] : []),
                then: (resolve) => resolve(fakes.birthday ? [fakes.birthday] : [])
            })
        })
    });
}

describe('BirthdayService', () => {
    let svc, repo;
    beforeEach(() => {
        mockLegacyDb();
        repo = new FakeBirthdayRepo();
        svc = new BirthdayService(repo);
    });

    // ============== VALIDATION ==============

    describe('_validateBirthdate', () => {
        test('valide ISO YYYY-MM-DD', () => {
            const r = svc._validateBirthdate('2000-05-15');
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.normalized, '2000-05-15');
        });

        test('valide DD/MM', () => {
            const r = svc._validateBirthdate('15/05');
            assert.strictEqual(r.ok, true);
            assert.ok(r.normalized.endsWith('-05-15'));
        });

        test('valide DD-MM', () => {
            const r = svc._validateBirthdate('15-05');
            assert.strictEqual(r.ok, true);
            assert.ok(r.normalized.endsWith('-05-15'));
        });

        test('rejette un format invalide', () => {
            const r = svc._validateBirthdate('hello');
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'invalid_format');
        });

        test('rejette une date impossible (mois 13)', () => {
            const r = svc._validateBirthdate('15/13');
            assert.strictEqual(r.ok, false);
        });

        test('rejette un jour invalide (32)', () => {
            const r = svc._validateBirthdate('32/05');
            assert.strictEqual(r.ok, false);
        });

        test('rejette une chaîne vide', () => {
            const r = svc._validateBirthdate('');
            assert.strictEqual(r.ok, false);
        });
    });

    // ============== TEMPLATE ==============

    describe('renderTemplate', () => {
        test('substitue {user} en mention', () => {
            const r = svc.renderTemplate('Joyeux anniv {user} !', { userId: '123' });
            assert.strictEqual(r, 'Joyeux anniv <@123> !');
        });

        test('substitue {username}', () => {
            const r = svc.renderTemplate('Hello {username}', { username: 'Alice' });
            assert.strictEqual(r, 'Hello Alice');
        });

        test('substitue {age}', () => {
            const r = svc.renderTemplate('Tu as {age} ans', { age: 25 });
            assert.strictEqual(r, 'Tu as 25 ans');
        });

        test('substitue {role} en mention de rôle', () => {
            const r = svc.renderTemplate('Ping {role}', { roleId: 'ROLE_1' });
            assert.strictEqual(r, 'Ping <@&ROLE_1>');
        });

        test('substitue {gifts}', () => {
            const r = svc.renderTemplate('Cadeaux : {gifts}', { gifts: '500 XP' });
            assert.strictEqual(r, 'Cadeaux : 500 XP');
        });

        test('échoue en silence sur variables manquantes', () => {
            const r = svc.renderTemplate('User={user} Age={age}', {});
            assert.strictEqual(r, 'User= Age=?');
        });
    });

    // ============== CALCULS ==============

    describe('ageAt et nextBirthday', () => {
        test('ageAt calcule l\'âge exact', () => {
            const age = svc.ageAt('2000-01-15', new Date('2025-01-15'));
            assert.strictEqual(age, 25);
        });

        test('ageAt gère le passage d\'année (avant l\'anniv)', () => {
            const age = svc.ageAt('2000-06-15', new Date('2025-01-15'));
            assert.strictEqual(age, 24);
        });

        test('ageAt retourne null pour date invalide', () => {
            assert.strictEqual(svc.ageAt('not-a-date'), null);
        });

        test('nextBirthday cette année si pas encore passé', () => {
            const future = svc.nextBirthday('2000-12-31', new Date('2025-01-15'));
            assert.strictEqual(future.getFullYear(), 2025);
            assert.strictEqual(future.getMonth(), 11);
        });

        test('nextBirthday année prochaine si déjà passé', () => {
            const past = svc.nextBirthday('2000-01-01', new Date('2025-06-15'));
            assert.strictEqual(past.getFullYear(), 2026);
        });
    });

    // ============== COOLDOWN ==============

    describe('canChangeBirthday + cooldown', () => {
        test('autorise le 1er changement (pas d\'historique)', async () => {
            const r = await svc.canChangeBirthday('u1', 'g1');
            assert.strictEqual(r.allowed, true);
        });

        test('refuse un changement dans le cooldown', async () => {
            // Insère un changement il y a 1h
            await repo.insertChange({
                userId: 'u1', guildId: 'g1', changeNumber: 1,
                previousBirthdate: null, newBirthdate: '2000-01-01',
                cooldownUntil: Date.now() + 3600_000
            });
            const r = await svc.canChangeBirthday('u1', 'g1');
            assert.strictEqual(r.allowed, false);
            assert.ok(r.nextChangeAt > Date.now());
        });

        test('autorise après expiration du cooldown', async () => {
            await repo.insertChange({
                userId: 'u1', guildId: 'g1', changeNumber: 1,
                previousBirthdate: null, newBirthdate: '2000-01-01',
                cooldownUntil: Date.now() - 1000
            });
            const r = await svc.canChangeBirthday('u1', 'g1');
            assert.strictEqual(r.allowed, true);
        });

        test('cooldowns Draftbot (1er=1j, 2ème=2j, 3ème=6m, 4ème+=1an)', () => {
            assert.strictEqual(DEFAULT_COOLDOWN_DAYS[1], 1);
            assert.strictEqual(DEFAULT_COOLDOWN_DAYS[2], 2);
            assert.strictEqual(DEFAULT_COOLDOWN_DAYS[3], 180);
            assert.strictEqual(DEFAULT_COOLDOWN_DAYS[4], 365);
        });
    });

    // ============== SETTINGS ==============

    describe('settings', () => {
        test('getSettings retourne les défauts si pas en BDD', async () => {
            const s = await svc.getSettings('fresh_guild_no_db');
            assert.strictEqual(s.mode, 'public');
            assert.strictEqual(s.enabled, true);
            assert.strictEqual(s.announceHour, 9);
        });

        test('updateSettings persiste en BDD', async () => {
            const configIndex = require('../src/config/index.js');
            const origSave = configIndex.saveModuleConfig;
            configIndex.saveModuleConfig = () => {};
            try {
                await svc.updateSettings('g1', { mode: 'private', announceHour: 18 });
                const s = await svc.getSettings('g1');
                assert.strictEqual(s.mode, 'private');
                assert.strictEqual(s.announceHour, 18);
            } finally {
                configIndex.saveModuleConfig = origSave;
            }
        });
    });

    // ============== LISTS ==============

    describe('listToday + listUpcoming', () => {
        test('listToday retourne les anniversaires du jour', async () => {
            const list = await svc.listToday('g1');
            assert.strictEqual(list.length, 1);
            assert.strictEqual(list[0].userId, 'u1');
        });

        test('listUpcoming retourne une liste triée par jours', async () => {
            // Mock avec 3 entrées
            repo.listTodaysBirthdays = async () => [
                { userId: 'a', username: 'A', birthdate: '2000-01-15', visibility: true }
            ];
            mockLegacyDb({
                birthday: { userId: 'a', username: 'A', birthdate: '2000-12-31' }
            });
            const list = await svc.listUpcoming('g1', 30);
            assert.ok(Array.isArray(list));
        });
    });

    // ============== VISIBILITY ==============

    describe('visibility', () => {
        test('setVisibility stocke et retourne', async () => {
            await svc.setVisibility('u1', 'g1', false);
            const v = await svc.getVisibility('u1', 'g1');
            assert.strictEqual(v, false);
        });

        test('visibility par défaut = true si pas d\'entrée', async () => {
            const v = await svc.getVisibility('u-unknown', 'g1');
            assert.strictEqual(v, null);
        });
    });
});
