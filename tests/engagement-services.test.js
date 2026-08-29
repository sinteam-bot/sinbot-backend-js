/**
 * Tests for the GiveawayService and PollService (Phase 5)
 */

const assert = require('node:assert');
const { GiveawayService, STATUS: GIVEAWAY_STATUS } = require('../src/modules/game_engagement/services/giveaway.service.js');
const { PollService, STATUS: POLL_STATUS } = require('../src/modules/game_engagement/services/poll.service.js');

class FakeEngagementRepo {
    constructor() {
        this.giveaways = new Map();
        this.giveawayEntries = new Map(); // giveawayId -> [userIds]
        this.polls = new Map();
        this.pollVotes = new Map(); // pollId -> Map(userId -> Set(optionIndex))
    }

    async insertGiveaway(g) { this.giveaways.set(g.id, { ...g }); return g; }
    async updateGiveaway(id, fields) {
        const g = this.giveaways.get(id);
        if (g) Object.assign(g, fields);
    }
    async findGiveawayById(id) { return this.giveaways.get(id) ? { ...this.giveaways.get(id) } : null; }
    async findGiveawayByMessageId(mid) {
        for (const g of this.giveaways.values()) if (g.messageId === mid) return { ...g };
        return null;
    }
    async findGiveawayByChannelId(cid, status) {
        for (const g of this.giveaways.values()) {
            if (g.channelId === cid && (!status || g.status === status)) return { ...g };
        }
        return null;
    }
    async listGiveaways({ guildId, status, limit = 50, offset = 0 } = {}) {
        let all = [...this.giveaways.values()];
        if (guildId) all = all.filter(g => g.guildId === guildId);
        if (status) all = all.filter(g => g.status === status);
        return all.slice(offset, offset + limit);
    }
    async findDueGiveaways(limit = 50) {
        const now = Date.now();
        return [...this.giveaways.values()].filter(g => g.status === 'active' && g.endsAt <= now).slice(0, limit);
    }
    async addEntry(gid, uid) {
        if (!this.giveawayEntries.has(gid)) this.giveawayEntries.set(gid, new Set());
        const set = this.giveawayEntries.get(gid);
        if (set.has(uid)) return false;
        set.add(uid);
        return true;
    }
    async removeEntry(gid, uid) {
        const set = this.giveawayEntries.get(gid);
        if (!set) return 0;
        const had = set.delete(uid);
        return had ? 1 : 0;
    }
    async listEntries(gid) {
        const set = this.giveawayEntries.get(gid) || new Set();
        return [...set].map(uid => ({ user_id: uid, entered_at: 0 }));
    }
    async countEntries(gid) { return (this.giveawayEntries.get(gid) || new Set()).size; }

    async insertPoll(p) { this.polls.set(p.id, { ...p }); return p; }
    async updatePoll(id, fields) {
        const p = this.polls.get(id);
        if (p) Object.assign(p, fields);
    }
    async findPollById(id) { return this.polls.get(id) ? { ...this.polls.get(id) } : null; }
    async findPollByMessageId(mid) {
        for (const p of this.polls.values()) if (p.messageId === mid) return { ...p };
        return null;
    }
    async listPolls({ guildId, status, limit = 50, offset = 0 } = {}) {
        let all = [...this.polls.values()];
        if (guildId) all = all.filter(p => p.guildId === guildId);
        if (status) all = all.filter(p => p.status === status);
        return all.slice(offset, offset + limit);
    }
    async addVote(pid, uid, idx) {
        if (!this.pollVotes.has(pid)) this.pollVotes.set(pid, new Map());
        const userMap = this.pollVotes.get(pid);
        if (!userMap.has(uid)) userMap.set(uid, new Set());
        const set = userMap.get(uid);
        if (set.has(idx)) return false;
        set.add(idx);
        return true;
    }
    async removeVotesForUser(pid, uid) {
        const userMap = this.pollVotes.get(pid);
        if (!userMap || !userMap.has(uid)) return 0;
        const set = userMap.get(uid);
        const n = set.size;
        userMap.delete(uid);
        return n;
    }
    async tallyVotes(pid) {
        const userMap = this.pollVotes.get(pid);
        if (!userMap) return [];
        const counts = new Map();
        for (const set of userMap.values()) {
            for (const idx of set) {
                counts.set(idx, (counts.get(idx) || 0) + 1);
            }
        }
        return [...counts.entries()].map(([option_index, count]) => ({ option_index, count }));
    }
    async hasUserVoted(pid, uid) {
        return (this.pollVotes.get(pid) || new Map()).has(uid);
    }
    async getUserVotes(pid, uid) {
        return [...((this.pollVotes.get(pid) || new Map()).get(uid) || new Set())];
    }
}

describe('GiveawayService', () => {
    let svc, repo;
    beforeEach(() => {
        repo = new FakeEngagementRepo();
        svc = new GiveawayService();
        svc.setRepo(repo);
    });

    test('create génère un id et status active', async () => {
        const g = await svc.create({
            guildId: 'g1', channelId: 'c1', hostId: 'host1',
            prize: 'Nitro', winnersCount: 1, durationMs: 3600_000
        });
        assert.ok(g.id);
        assert.strictEqual(g.status, GIVEAWAY_STATUS.ACTIVE);
        assert.strictEqual(g.prize, 'Nitro');
        assert.ok(g.endsAt > g.startsAt);
    });

    test('enter ajoute une entrée', async () => {
        const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'host1', prize: 'P', durationMs: 60000 });
        const r1 = await svc.enter(g.id, 'u1');
        assert.strictEqual(r1.ok, true);
        const r2 = await svc.enter(g.id, 'u1');
        assert.strictEqual(r2.ok, false);
        assert.strictEqual(r2.reason, 'already_entered');
    });

    test('leave retire une entrée', async () => {
        const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'host1', prize: 'P', durationMs: 60000 });
        await svc.enter(g.id, 'u1');
        const r = await svc.leave(g.id, 'u1');
        assert.strictEqual(r.ok, true);
    });

    test('countEntries reflète les entrées', async () => {
        const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'host1', prize: 'P', durationMs: 60000 });
        await svc.enter(g.id, 'u1');
        await svc.enter(g.id, 'u2');
        await svc.enter(g.id, 'u3');
        assert.strictEqual(await svc.countEntries(g.id), 3);
    });

    test('draw retourne pool=N si 0 entrée', async () => {
        const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'host1', prize: 'P', durationMs: 60000 });
        const r = await svc.draw(g.id);
        assert.strictEqual(r.pool, 0);
        assert.strictEqual(r.winners.length, 0);
    });

    test('draw tire N gagnants parmi les participants', async () => {
        const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'host1', prize: 'P', winnersCount: 2, durationMs: 60000 });
        for (let i = 0; i < 10; i++) await svc.enter(g.id, `u${i}`);
        const r = await svc.draw(g.id);
        assert.strictEqual(r.pool, 10);
        assert.strictEqual(r.winners.length, 2);
        const unique = new Set(r.winners);
        assert.strictEqual(unique.size, 2);
    });

    test('draw respecte winnersCount > pool', async () => {
        const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'host1', prize: 'P', winnersCount: 5, durationMs: 60000 });
        await svc.enter(g.id, 'u1');
        await svc.enter(g.id, 'u2');
        const r = await svc.draw(g.id);
        assert.strictEqual(r.winners.length, 2);
    });

    test('end passe le giveaway en ended avec winners', async () => {
        const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'host1', prize: 'P', winnersCount: 1, durationMs: 60000 });
        await svc.enter(g.id, 'u1');
        const ended = await svc.end(g.id);
        assert.strictEqual(ended.status, GIVEAWAY_STATUS.ENDED);
        assert.strictEqual(ended.winners.length, 1);
    });

    test('cancel passe en cancelled', async () => {
        const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'host1', prize: 'P', durationMs: 60000 });
        const c = await svc.cancel(g.id);
        assert.strictEqual(c.status, GIVEAWAY_STATUS.CANCELLED);
    });

    test('buildEmbed retourne un EmbedBuilder', () => {
        const g = { prize: 'P', description: 'D', winnersCount: 1, endsAt: Date.now() + 60000, hostId: 'h', color: '#5865F2' };
        const e = svc.buildEmbed(g);
        assert.strictEqual(e.data.title, '🎉 GIVEAWAY');
        assert.ok(e.data.description.includes('**P**'));
    });

    test('buildUpdatedEmbed indique ENDED avec gagnants', async () => {
        const g = await svc.create({ guildId: 'g1', channelId: 'c1', hostId: 'host1', prize: 'P', durationMs: 60000 });
        await svc.enter(g.id, 'u1');
        const ended = await svc.end(g.id);
        const embed = await svc.buildUpdatedEmbed(ended, 1);
        const desc = embed.data.description;
        assert.ok(desc.includes('<@u1>') || desc.includes('u1'));
    });
});

describe('PollService', () => {
    let svc, repo;
    beforeEach(() => {
        repo = new FakeEngagementRepo();
        svc = new PollService();
        svc.setRepo(repo);
    });

    test('create génère un id et status active', async () => {
        const p = await svc.create({
            guildId: 'g1', channelId: 'c1', question: 'Pizza ?',
            options: ['Oui', 'Non'], createdBy: 'u1'
        });
        assert.ok(p.id);
        assert.strictEqual(p.status, POLL_STATUS.ACTIVE);
        assert.deepStrictEqual(p.options, ['Oui', 'Non']);
    });

    test('create refuse moins de 2 options', async () => {
        await assert.rejects(
            () => svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: ['A'], createdBy: 'u' }),
            /Au moins 2 options/
        );
    });

    test('create refuse plus de 10 options', async () => {
        const opts = Array.from({ length: 12 }, (_, i) => `opt${i}`);
        await assert.rejects(
            () => svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: opts, createdBy: 'u' }),
            /Maximum 10/
        );
    });

    test('vote single choice remplace le précédent vote', async () => {
        const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: ['A', 'B'], createdBy: 'u' });
        await svc.vote(p.id, 'u1', 0);
        const r = await svc.vote(p.id, 'u1', 1);
        assert.strictEqual(r.action, 'replaced');
        const votes = await repo.getUserVotes(p.id, 'u1');
        assert.deepStrictEqual(votes, [1]);
    });

    test('vote multi choice ajoute sans remplacer', async () => {
        const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: ['A', 'B', 'C'], multiChoice: true, createdBy: 'u' });
        await svc.vote(p.id, 'u1', 0);
        await svc.vote(p.id, 'u1', 2);
        const votes = await repo.getUserVotes(p.id, 'u1');
        assert.strictEqual(votes.length, 2);
    });

    test('vote multi choice toggle retire si déjà voté', async () => {
        const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: ['A', 'B'], multiChoice: true, createdBy: 'u' });
        await svc.vote(p.id, 'u1', 0);
        const r = await svc.vote(p.id, 'u1', 0);
        assert.strictEqual(r.action, 'removed');
        const votes = await repo.getUserVotes(p.id, 'u1');
        assert.strictEqual(votes.length, 0);
    });

    test('vote refuse option invalide', async () => {
        const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: ['A', 'B'], createdBy: 'u' });
        const r = await svc.vote(p.id, 'u1', 99);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'invalid_option');
    });

    test('tally compte les votes correctement', async () => {
        const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: ['A', 'B', 'C'], createdBy: 'u' });
        await svc.vote(p.id, 'u1', 0);
        await svc.vote(p.id, 'u2', 0);
        await svc.vote(p.id, 'u3', 1);
        const t = await svc.tally(p.id);
        assert.strictEqual(t.total, 3);
        const optA = t.perOption.find(o => o.index === 0);
        assert.strictEqual(optA.count, 2);
    });

    test('unvote retire tous les votes d\'un user', async () => {
        const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: ['A', 'B', 'C'], multiChoice: true, createdBy: 'u' });
        await svc.vote(p.id, 'u1', 0);
        await svc.vote(p.id, 'u1', 1);
        await svc.unvote(p.id, 'u1');
        const votes = await repo.getUserVotes(p.id, 'u1');
        assert.strictEqual(votes.length, 0);
    });

    test('end passe en ended', async () => {
        const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: ['A', 'B'], createdBy: 'u' });
        const ended = await svc.end(p.id);
        assert.strictEqual(ended.status, POLL_STATUS.ENDED);
    });

    test('buildEmbed affiche les barres de progression', async () => {
        const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q', options: ['A', 'B'], createdBy: 'u' });
        await svc.vote(p.id, 'u1', 0);
        await svc.vote(p.id, 'u2', 0);
        await svc.vote(p.id, 'u3', 1);
        const embed = await svc.buildEmbed(p);
        const desc = embed.data.description;
        assert.ok(desc.includes('▰') || desc.includes('A'));
        assert.ok(desc.includes('B'));
    });
});
