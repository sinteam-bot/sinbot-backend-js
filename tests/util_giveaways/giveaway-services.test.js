/**
 * Tests for the GiveawayService (Phase 9.2 du split util_giveaways)
 *
 * Couvre :
 *  - create : validation des params, insertion en BDD
 *  - get / getByMessage / getByChannel / list / findDue
 *  - setMessageId, enter, leave, hasEntered, countEntries, listEntries
 *  - draw : tirage CSPRNG de N gagnants
 *  - end : finalisation (status=ended, winners set)
 *  - cancel : annulation (status=cancelled)
 *  - buildEmbed : embed Discord avec bons champs
 *  - buildUpdatedEmbed : embed avec compteur d'entrées
 */

import { test, describe } from 'vitest';
import assert from 'node:assert';
const { GiveawayService } = require('../../src/modules/util_giveaways/services/giveaway.service.js');

function makeService({ repo } = {}) {
    const svc = new GiveawayService();
    if (repo) svc.setRepo(repo);
    return svc;
}

function makeMockRepo() {
    const stored = new Map();
    let idCounter = 0;
    return {
        _stored: stored,
        async insertGiveaway(g) {
            const id = g.id || `gw_${++idCounter}`;
            const row = { ...g, id, status: g.status || 'active' };
            stored.set(id, row);
            return row;
        },
        async findGiveawayById(id) { return stored.get(id) || null; },
        async findGiveawayByMessageId(mid) {
            for (const g of stored.values()) if (g.messageId === mid) return g;
            return null;
        },
        async findGiveawayByChannelId(cid, status = null) {
            for (const g of stored.values()) {
                if (g.channelId === cid && (!status || g.status === status)) return g;
            }
            return null;
        },
        async listGiveaways({ guildId, status } = {}) {
            return [...stored.values()].filter(g =>
                (!guildId || g.guildId === guildId) && (!status || g.status === status)
            );
        },
        async findDueGiveaways(limit = 50) {
            const now = Date.now();
            return [...stored.values()].filter(g => g.status === 'active' && g.endsAt <= now).slice(0, limit);
        },
        async updateGiveaway(id, fields) {
            const g = stored.get(id);
            if (!g) return;
            Object.assign(g, fields);
        },
        async addEntry(gid, uid) {
            const g = stored.get(gid);
            if (!g) return false;
            g.entries = g.entries || new Map();
            if (g.entries.has(uid)) return false;
            g.entries.set(uid, uid);
            return true;
        },
        async removeEntry(gid, uid) {
            const g = stored.get(gid);
            if (!g) return 0;
            g.entries = g.entries || new Map();
            const had = g.entries.delete(uid);
            return had ? 1 : 0;
        },
        async getGiveawayEntry(gid, uid) {
            const g = stored.get(gid);
            if (!g || !g.entries) return null;
            return g.entries.has(uid) ? { user_id: uid } : null;
        },
        async countEntries(gid) {
            const g = stored.get(gid);
            return g?.entries?.size || 0;
        },
        async getGiveawayEntries(gid) {
            const g = stored.get(gid);
            if (!g || !g.entries) return [];
            return [...g.entries.keys()].map(userId => ({ user_id: userId }));
        },
        async listEntries(gid) {
            const g = stored.get(gid);
            if (!g || !g.entries) return [];
            return [...g.entries.keys()].map(userId => ({ user_id: userId }));
        }
    };
}

describe('GiveawayService', () => {
    describe('create', () => {
        test('rejette sans guildId/channelId/hostId/prize', async () => {
            const svc = makeService();
            await assert.rejects(() => svc.create({}), /requis/);
            await assert.rejects(() => svc.create({ guildId: 'g' }), /requis/);
            await assert.rejects(() => svc.create({ guildId: 'g', channelId: 'c', hostId: 'h' }), /requis/);
        });

        test('crée un giveaway avec defaults', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({
                guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'Nitro'
            });
            assert.strictEqual(g.guildId, 'g1');
            assert.strictEqual(g.status, 'active');
            assert.ok(g.id, 'un id est généré');
            assert.ok(g.endsAt > g.startsAt, 'endsAt > startsAt');
            assert.strictEqual(g.winnersCount, 1, 'winnersCount default 1');
        });

        test('respecte winnersCount custom et requiredRoleId', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({
                guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'Role',
                winnersCount: 3, requiredRoleId: 'role-x', color: 0xFF0000
            });
            assert.strictEqual(g.winnersCount, 3);
            assert.strictEqual(g.requiredRoleId, 'role-x');
            assert.strictEqual(g.color, 0xFF0000);
        });
    });

    describe('get / getByMessage / getByChannel / list / findDue', () => {
        test('get retourne le giveaway par id', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            const fetched = await svc.get(g.id);
            assert.strictEqual(fetched.id, g.id);
            assert.strictEqual(fetched.prize, 'A');
        });

        test('getByMessage et getByChannel fonctionnent', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'X' });
            await svc.setMessageId(g.id, 'msg-42');
            const byMsg = await svc.getByMessage('msg-42');
            assert.ok(byMsg);

            const c = await svc.create({ guildId: 'g1', channelId: 'c-special', hostId: 'h', prize: 'X' });
            const byChan = await svc.getByChannel('c-special');
            assert.ok(byChan);
        });

        test('list filtre par guildId et status', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const a = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            const b = await svc.create({ guildId: 'g1', channelId: 'c2', hostId: 'h1', prize: 'B' });
            const c = await svc.create({ guildId: 'g2', channelId: 'c1', hostId: 'h1', prize: 'C' });
            await svc.end(b.id);

            const g1List = await svc.list({ guildId: 'g1' });
            assert.strictEqual(g1List.length, 2);
            const g1Active = await svc.list({ guildId: 'g1', status: 'active' });
            assert.strictEqual(g1Active.length, 1);
            assert.strictEqual(g1Active[0].id, a.id);
        });

        test('findDue retourne les giveaways到期', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            // a : endsAt dans le passé (dû)
            const a = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A', durationMs: -1000 });
            // b : endsAt dans le futur (pas dû)
            await svc.create({ guildId: 'g1', channelId: 'c2', hostId: 'h1', prize: 'B', durationMs: 60000 });

            const due = await svc.findDue();
            assert.strictEqual(due.length, 1);
            assert.strictEqual(due[0].id, a.id);
        });
    });

    describe('setMessageId / enter / leave / hasEntered', () => {
        test('setMessageId met à jour le messageId', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            await svc.setMessageId(g.id, 'msg-123');
            const fetched = await svc.getByMessage('msg-123');
            assert.strictEqual(fetched.id, g.id);
        });

        test('enter ajoute un participant (idempotent)', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            const r1 = await svc.enter(g.id, 'u1');
            assert.strictEqual(r1.ok, true);
            const r2 = await svc.enter(g.id, 'u1');
            // 2e appel : déjà inscrit, addEntry retourne false mais pas d'exception
            assert.strictEqual(typeof r2.ok, 'boolean');
            assert.strictEqual(await svc.hasEntered(g.id, 'u1'), true);
        });

        test('leave retire un participant', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            await svc.enter(g.id, 'u1');
            const r = await svc.leave(g.id, 'u1');
            assert.strictEqual(r.ok, true);
            assert.strictEqual(await svc.hasEntered(g.id, 'u1'), false);
        });
    });

    describe('countEntries / listEntries', () => {
        test('countEntries retourne le nombre', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            assert.strictEqual(await svc.countEntries(g.id), 0);
            await svc.enter(g.id, 'u1');
            await svc.enter(g.id, 'u2');
            await svc.enter(g.id, 'u3');
            assert.strictEqual(await svc.countEntries(g.id), 3);
        });

        test('listEntries retourne les userIds', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            await svc.enter(g.id, 'u1');
            await svc.enter(g.id, 'u2');
            const list = await svc.listEntries(g.id);
            assert.strictEqual(list.length, 2);
            const ids = list.slice().sort();
            assert.deepStrictEqual(ids, ['u1', 'u2']);
        });
    });

    describe('draw', () => {
        test('refuse si giveaway inexistant', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.draw('inconnu');
            assert.strictEqual(r.winners.length, 0);
        });

        test('refuse si pas assez de participants', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({
                guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A',
                winnersCount: 3
            });
            // Pas de participants : draw doit retourner vide
            const r = await svc.draw(g.id);
            assert.strictEqual(r.winners.length, 0, 'pas de gagnant');
            assert.strictEqual(r.pool, 0, 'pool vide');
        });

        test('tire le bon nombre de gagnants', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({
                guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A',
                winnersCount: 3
            });
            for (let i = 0; i < 10; i++) await svc.enter(g.id, `u${i}`);

            const r = await svc.draw(g.id);
            assert.strictEqual(r.winners.length, 3, 'tire 3 gagnants sur 10');
            assert.strictEqual(r.pool, 10);
            // Tous uniques
            const uniq = new Set(r.winners);
            assert.strictEqual(uniq.size, 3, '3 gagnants uniques');
        });

        test('winnersCount 1 retourne un seul gagnant', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({
                guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A'
            });
            await svc.enter(g.id, 'u1');
            await svc.enter(g.id, 'u2');
            const r = await svc.draw(g.id);
            assert.strictEqual(r.winners.length, 1);
        });
    });

    describe('end / cancel', () => {
        test('end marque status=ended et set winners', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            await svc.enter(g.id, 'u1');
            const r = await svc.end(g.id, ['u1']);
            assert.strictEqual(r.status, 'ended');
            const fetched = await svc.get(g.id);
            assert.strictEqual(fetched.status, 'ended');
            assert.deepStrictEqual(fetched.winners, ['u1']);
        });

        test('end sans participants donne winners vide', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            const r = await svc.end(g.id);
            assert.strictEqual(r.status, 'ended');
            assert.deepStrictEqual(r.winners, []);
        });

        test('cancel marque status=cancelled', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'h1', prize: 'A' });
            const r = await svc.cancel(g.id);
            assert.strictEqual(r.status, 'cancelled');
        });
    });

    describe('buildEmbed', () => {
        test('génère un embed avec les bons champs', () => {
            const svc = makeService();
            const g = {
                id: 'gw-1', prize: 'Nitro', description: 'un super prix',
                winnersCount: 1, hostId: 'h1', channelId: 'c1',
                guildId: 'g1', startsAt: 1000, endsAt: 2000,
                status: 'active', requiredRoleId: null
            };
            const embed = svc.buildEmbed(g);
            assert.ok(embed.data, 'embed doit avoir data');
            // Le prix est dans la description
            assert.ok(embed.data.description.includes('Nitro'));
            // Le titre existe
            assert.ok(embed.data.title);
            // Les fields incluent gagnants, fin, participants
            const fieldNames = (embed.data.fields || []).map(f => f.name);
            assert.ok(fieldNames.includes('🏆 Gagnants'));
            assert.ok(fieldNames.includes('⏰ Fin'));
        });
    });

    describe('buildUpdatedEmbed', () => {
        test('met à jour le champ Participants', async () => {
            const svc = makeService();
            const g = { id: 'gw-1', prize: 'X', description: null, winnersCount: 1, hostId: 'h1', channelId: 'c1', guildId: 'g1', startsAt: 0, endsAt: 1, status: 'active', requiredRoleId: null };
            const embed = await svc.buildUpdatedEmbed(g, 42);
            assert.ok(embed.data);
            const partField = (embed.data.fields || []).find(f => f.name === '👥 Participants');
            assert.ok(partField, 'champ Participants existe');
            assert.strictEqual(partField.value, '42');
        });
    });
});
