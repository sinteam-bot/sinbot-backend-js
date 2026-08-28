/**
 * Tests for ReportsService (Phase 12)
 */

const assert = require('node:assert');
const { ReportsService } = require('../src/modules/feature_reports/services/reports.service.js');

class FakeRepo {
    constructor() {
        this.byId = new Map();
        this.byReporterAgainst = new Map(); // key: g::reporter::reported -> latest
    }
    _k(g, r) { return `${g}::${r}`; }
    _kAll(g, reporter, reported) { return `${g}::${reporter}::${reported}`; }

    async insertReport(r) {
        const id = r.id || 'r' + Math.random();
        const now = Date.now();
        const full = {
            id,
            guildId: r.guildId,
            reporterId: r.reporterId,
            reportedId: r.reportedId,
            channelId: r.channelId || null,
            messageId: r.messageId || null,
            reason: r.reason,
            category: r.category || 'other',
            status: r.status || 'open',
            resolvedBy: null,
            resolvedAt: null,
            createdAt: r.createdAt || now
        };
        this.byId.set(id, full);
        this.byReporterAgainst.set(this._kAll(r.guildId, r.reporterId, r.reportedId), full);
        return full;
    }
    async updateReport(id, fields) {
        const r = this.byId.get(id);
        if (!r) return;
        Object.assign(r, fields);
        // re-map for camelCase consistency
        if (fields.resolved_by !== undefined) r.resolvedBy = fields.resolved_by;
    }
    async getReport(id) {
        const r = this.byId.get(id);
        if (!r) return null;
        return {
            id: r.id,
            guildId: r.guildId,
            reporterId: r.reporterId,
            reportedId: r.reportedId,
            channelId: r.channelId,
            messageId: r.messageId,
            reason: r.reason,
            category: r.category,
            status: r.status,
            resolvedBy: r.resolvedBy ?? r.resolved_by ?? null,
            resolvedAt: r.resolvedAt ?? r.resolved_at ?? null,
            createdAt: r.createdAt
        };
    }
    async listReports({ guildId, status, reporterId, reportedId, limit = 50, offset = 0 } = {}) {
        let list = [...this.byId.values()].filter(r => r.guildId === guildId);
        if (status) list = list.filter(r => r.status === status);
        if (reporterId) list = list.filter(r => r.reporterId === reporterId);
        if (reportedId) list = list.filter(r => r.reportedId === reportedId);
        return list.slice(offset, offset + limit);
    }
    async countByGuild(guildId, status) {
        let list = [...this.byId.values()].filter(r => r.guildId === guildId);
        if (status) list = list.filter(r => r.status === status);
        return list.length;
    }
    async countOpenAgainstUser(guildId, reportedId) {
        return [...this.byId.values()].filter(r =>
            r.guildId === guildId && r.reportedId === reportedId && r.status === 'open'
        ).length;
    }
    async lastByReporterAgainst(guildId, reporterId, reportedId) {
        const list = [...this.byId.values()].filter(r =>
            r.guildId === guildId && r.reporterId === reporterId && r.reportedId === reportedId
        );
        list.sort((a, b) => b.createdAt - a.createdAt);
        return list[0] || null;
    }
    async insertAction(a) {
        const id = a.id || 'a' + Math.random();
        const now = Date.now();
        return { id, ...a, createdAt: now };
    }
    async listActions(reportId) {
        return [];
    }
}

describe('ReportsService', () => {
    let svc, repo;
    beforeEach(() => { repo = new FakeRepo(); svc = new ReportsService(repo); });

    describe('create', () => {
        test('crée un report valide', async () => {
            const r = await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: 'spam' });
            assert.strictEqual(r.ok, true);
            assert.ok(r.data.id);
            assert.strictEqual(r.data.reason, 'spam');
            assert.strictEqual(r.data.status, 'open');
        });

        test('rejette reporter === reported (cannot_report_self)', async () => {
            const r = await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u1', reason: 'x' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'cannot_report_self');
        });

        test('rejette reason vide', async () => {
            const r = await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: '' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'reason_required');
        });

        test('rejette params manquants', async () => {
            const r = await svc.create({});
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'missing_params');
        });

        test('rejette si cooldown pas écoulé', async () => {
            await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: 'r1' });
            const r = await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: 'r2' });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'cooldown');
        });

        test('autorise après cooldown (5 min)', async () => {
            const cfg = { cooldown_seconds: 0.0001 }; // ~ 0.1 ms
            await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: 'r1', config: cfg });
            await new Promise(r => setTimeout(r, 5));
            const r = await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: 'r2', config: cfg });
            assert.strictEqual(r.ok, true);
        });

        test('rejette si trop de reports ouverts contre la cible', async () => {
            // max_open_per_user = 2
            // First create 2 reports from different reporters
            await svc.create({ guildId: 'g1', reporterId: 'a', reportedId: 'v', reason: 'r1', config: { cooldown_seconds: 0 } });
            await svc.create({ guildId: 'g1', reporterId: 'b', reportedId: 'v', reason: 'r2', config: { cooldown_seconds: 0 } });
            // Third should fail
            const r = await svc.create({ guildId: 'g1', reporterId: 'c', reportedId: 'v', reason: 'r3', config: { max_open_per_user: 2, cooldown_seconds: 0 } });
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'too_many_open_reports');
        });
    });

    describe('resolve / dismiss', () => {
        test('resolve passe en resolved + log action', async () => {
            const created = await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: 'r' });
            const r = await svc.resolve(created.data.id, 'staff1', 'warn', 'comportement inapproprié');
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.data.status, 'resolved');
            assert.strictEqual(r.data.resolvedBy, 'staff1');
            assert.ok(r.data.resolvedAt);
        });

        test('dismiss passe en dismissed + log action', async () => {
            const created = await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: 'r' });
            const r = await svc.dismiss(created.data.id, 'staff1', 'faux signalement');
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.data.status, 'dismissed');
        });

        test('resolve refuse si report introuvable', async () => {
            const r = await svc.resolve('unknown', 's', 'warn');
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'not_found');
        });

        test('resolve refuse si pas open', async () => {
            const created = await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: 'r' });
            await svc.resolve(created.data.id, 's', 'warn');
            const r = await svc.resolve(created.data.id, 's2', 'ban');
            assert.strictEqual(r.ok, false);
            assert.strictEqual(r.error, 'not_open');
        });
    });

    describe('stats', () => {
        test('retourne les compteurs par status', async () => {
            const cfg = { cooldown_seconds: 0 };
            const a = await svc.create({ guildId: 'g1', reporterId: 'a', reportedId: 't1', reason: 'r1', config: cfg });
            const b = await svc.create({ guildId: 'g1', reporterId: 'b', reportedId: 't2', reason: 'r2', config: cfg });
            const c = await svc.create({ guildId: 'g1', reporterId: 'c', reportedId: 't3', reason: 'r3', config: cfg });
            await svc.resolve(a.data.id, 's', 'warn');
            await svc.dismiss(b.data.id, 's', '');

            const stats = await svc.stats('g1');
            assert.strictEqual(stats.open, 1);
            assert.strictEqual(stats.resolved, 1);
            assert.strictEqual(stats.dismissed, 1);
            assert.strictEqual(stats.total, 3);
        });
    });

    describe('list / get', () => {
        test('list filtre par status', async () => {
            const cfg = { cooldown_seconds: 0 };
            await svc.create({ guildId: 'g1', reporterId: 'a', reportedId: 't1', reason: 'r1', config: cfg });
            await svc.create({ guildId: 'g1', reporterId: 'b', reportedId: 't2', reason: 'r2', config: cfg });
            const all = await svc.list('g1');
            assert.strictEqual(all.length, 2);
            const open = await svc.list('g1', { status: 'open' });
            assert.strictEqual(open.length, 2);
        });

        test('get retourne le report par id', async () => {
            const created = await svc.create({ guildId: 'g1', reporterId: 'u1', reportedId: 'u2', reason: 'r' });
            const got = await svc.get(created.data.id);
            assert.ok(got);
            assert.strictEqual(got.reason, 'r');
        });
    });
});
