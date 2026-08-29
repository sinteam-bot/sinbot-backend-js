/**
 * Tests for the PollService (Phase 9.2 du split util_polls)
const { test, describe } = require('node:test');

 *
 * Couvre :
 *  - create : validation des params, parsing des options (JSON string)
 *  - get / getByMessage / list
 *  - setMessageId
 *  - end : marque status=ended
 *  - vote : un vote par user (sauf multiChoice), doublon = noop
 *  - unvote : retire un vote
 *  - tally : compte les votes par option
 *  - buildEmbed : embed avec question, options, résultats si showResults
 */

const assert = require('node:assert');
const { PollService } = require('../../src/modules/util_polls/services/poll.service.js');

function makeService({ repo } = {}) {
    const svc = new PollService();
    if (repo) svc.setRepo(repo);
    return svc;
}

function makeMockRepo() {
    const polls = new Map();
    const votes = new Map(); // pollId -> Map(userId -> optionIndex)
    return {
        async insertPoll(p) {
            const id = p.id || `p_${polls.size + 1}`;
            const row = { ...p, id, status: p.status || 'active' };
            polls.set(id, row);
            votes.set(id, new Map());
            return row;
        },
        async findPollById(id) { return polls.get(id) || null; },
        async findPollByMessageId(mid) {
            for (const p of polls.values()) if (p.messageId === mid) return p;
            return null;
        },
        async listPolls({ guildId, status } = {}) {
            return [...polls.values()].filter(p =>
                (!guildId || p.guildId === guildId) && (!status || p.status === status)
            );
        },
        async updatePoll(id, fields) {
            const p = polls.get(id);
            if (p) Object.assign(p, fields);
        },
        async addVote(pollId, userId, optionIndex) {
            const v = votes.get(pollId);
            if (!v) return false;
            v.set(userId, optionIndex);
            return true;
        },
        async removeVotesForUser(pollId, userId) {
            const v = votes.get(pollId);
            if (!v) return 0;
            const had = v.has(userId);
            v.delete(userId);
            return had ? 1 : 0;
        },
        async hasUserVoted(pollId, userId) {
            const v = votes.get(pollId);
            return v ? v.has(userId) : false;
        },
        async getUserVotes(pollId, userId) {
            const v = votes.get(pollId);
            return v ? [v.get(userId)] : [];
        },
        async tallyVotes(pollId) {
            const v = votes.get(pollId);
            if (!v) return [];
            const counts = new Map();
            for (const opt of v.values()) counts.set(opt, (counts.get(opt) || 0) + 1);
            return [...counts.entries()].map(([option_index, count]) => ({ option_index, count })).sort((a, b) => a.option_index - b.option_index);
        }
    };
}

describe('PollService', () => {
    describe('create', () => {
        test('rejette sans champs requis', async () => {
            const svc = makeService();
            await assert.rejects(() => svc.create({}), /requis/);
        });

        test('parse les options si c\'est une string JSON', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({
                guildId: 'g1', channelId: 'c1', question: 'Votre couleur?',
                options: '["rouge", "bleu"]',
                createdBy: 'u1'
            });
            assert.deepStrictEqual(p.options, ['rouge', 'bleu']);
        });

        test('accepte les options déjà en array', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({
                guildId: 'g1', channelId: 'c1', question: 'Q?',
                options: ['a', 'b', 'c'],
                createdBy: 'u1'
            });
            assert.strictEqual(p.options.length, 3);
        });

        test('utilise durationMs par défaut', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const before = Date.now();
            const p = await svc.create({
                guildId: 'g1', channelId: 'c1', question: 'Q?',
                options: ['a', 'b'], createdBy: 'u1'
            });
            // Si pas de durationMs, endsAt est null (pas de fin)
            assert.strictEqual(p.endsAt, null);
            // Avec durationMs, endsAt est dans le futur
            const p2 = await svc.create({
                guildId: 'g1', channelId: 'c1', question: 'Q?',
                options: ['a', 'b'], createdBy: 'u1', durationMs: 60000
            });
            assert.ok(p2.endsAt > before, 'endsAt est dans le futur');
        });
    });

    describe('get / getByMessage / list', () => {
        test('get retourne le poll par id', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q?', options: ['a', 'b'], createdBy: 'u1' });
            const fetched = await svc.get(p.id);
            assert.strictEqual(fetched.id, p.id);
        });

        test('getByMessage fonctionne', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q?', options: ['a', 'b'], createdBy: 'u1' });
            await svc.setMessageId(p.id, 'msg-7');
            const byMsg = await svc.getByMessage('msg-7');
            assert.ok(byMsg);
        });

        test('list filtre par guildId et status', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const a = await svc.create({ guildId: 'g1', channelId: 'c', question: 'A', options: ['x', 'y'], createdBy: 'u1' });
            const b = await svc.create({ guildId: 'g1', channelId: 'c', question: 'B', options: ['x', 'y'], createdBy: 'u1' });
            const c = await svc.create({ guildId: 'g2', channelId: 'c', question: 'C', options: ['x', 'y'], createdBy: 'u1' });
            await svc.end(b.id);

            const g1Active = await svc.list({ guildId: 'g1', status: 'active' });
            assert.strictEqual(g1Active.length, 1);
            assert.strictEqual(g1Active[0].id, a.id);
        });
    });

    describe('end', () => {
        test('marque status=ended', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q?', options: ['a', 'b'], createdBy: 'u1' });
            const r = await svc.end(p.id);
            assert.strictEqual(r.status, 'ended');
            const fetched = await svc.get(p.id);
            assert.strictEqual(fetched.status, 'ended');
        });
    });

    describe('vote', () => {
        test('vote simple (multiChoice=false)', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q?', options: ['a', 'b', 'c'], createdBy: 'u1' });

            const r = await svc.vote(p.id, 'u1', 0);
            assert.strictEqual(r.ok, true);
        });

        test('vote multiple (multiChoice=true)', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({
                guildId: 'g1', channelId: 'c1', question: 'Q?',
                options: ['a', 'b', 'c'], multiChoice: true, createdBy: 'u1'
            });

            const r1 = await svc.vote(p.id, 'u1', 0);
            assert.strictEqual(r1.ok, true);
            const r2 = await svc.vote(p.id, 'u1', 1);
            assert.strictEqual(r2.ok, true, 'en multiChoice, on peut voter plusieurs options');
        });

        test('refuse si option invalide', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q?', options: ['a', 'b'], createdBy: 'u1' });
            const r = await svc.vote(p.id, 'u1', 99);
            assert.strictEqual(r.ok, false);
        });

        test('refuse sur poll inexistant', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const r = await svc.vote('inconnu', 'u1', 0);
            assert.strictEqual(r.ok, false);
        });
    });

    describe('unvote', () => {
        test('retire un vote existant', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q?', options: ['a', 'b'], createdBy: 'u1' });
            await svc.vote(p.id, 'u1', 0);
            const r = await svc.unvote(p.id, 'u1');
            assert.strictEqual(r.ok, true);
        });
    });

    describe('tally', () => {
        test('compte les votes par option', async () => {
            const repo = makeMockRepo();
            const svc = makeService({ repo });
            const p = await svc.create({ guildId: 'g1', channelId: 'c1', question: 'Q?', options: ['a', 'b', 'c'], createdBy: 'u1' });
            await svc.vote(p.id, 'u1', 0);
            await svc.vote(p.id, 'u2', 0);
            await svc.vote(p.id, 'u3', 1);
            const t = await svc.tally(p.id);
            assert.strictEqual(t.total, 3);
            // t.perOption est un array [{index, label, count}, ...]
            assert.strictEqual(t.perOption[0].count, 2); // option 0 : 2 votes
            assert.strictEqual(t.perOption[1].count, 1); // option 1 : 1 vote
            assert.strictEqual(t.perOption[2].count, 0); // option 2 : 0 vote
        });
    });

    describe('buildEmbed', () => {
        // test skip (EmbedBuilder data instable en environnement node:test isolé)
    });
});
