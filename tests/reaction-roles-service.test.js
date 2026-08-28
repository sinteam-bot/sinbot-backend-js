/**
 * Tests for the ReactionRolesService (Phase RR)
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { ReactionRolesService } = require('../src/modules/feature_reaction-roles/services/reaction-roles.service.js');

class FakeRepo {
    constructor() {
        this.byId = new Map();
        this.byMessageEmoji = new Map();
        this.byMessage = new Map();
    }
    _key(messageId, emoji) { return `${messageId}::${emoji}`; }
    async insert(r) {
        this.byId.set(r.id, r);
        const k = this._key(r.messageId, r.emoji);
        this.byMessageEmoji.set(k, r);
        if (!this.byMessage.has(r.messageId)) this.byMessage.set(r.messageId, []);
        this.byMessage.get(r.messageId).push(r);
        return r;
    }
    async update(id, fields) {
        const r = this.byId.get(id);
        if (!r) return;
        Object.assign(r, fields);
        this.byMessageEmoji.set(this._key(r.messageId, r.emoji), r);
    }
    async delete(id) {
        const r = this.byId.get(id);
        if (!r) return;
        this.byId.delete(id);
        this.byMessageEmoji.delete(this._key(r.messageId, r.emoji));
        const list = this.byMessage.get(r.messageId) || [];
        this.byMessage.set(r.messageId, list.filter(x => x.id !== id));
    }
    async deleteByMessage(guildId, messageId) {
        const list = this.byMessage.get(messageId) || [];
        for (const r of list.filter(x => x.guildId === guildId)) {
            await this.delete(r.id);
        }
    }
    async findById(id) { return this.byId.get(id) || null; }
    async findByMessageEmoji(messageId, emoji) {
        return this.byMessageEmoji.get(this._key(messageId, emoji)) || null;
    }
    async listByMessage(guildId, messageId) {
        return (this.byMessage.get(messageId) || []).filter(r => r.guildId === guildId);
    }
    async listByGuild({ guildId, limit = 100, offset = 0 } = {}) {
        return [...this.byId.values()]
            .filter(r => r.guildId === guildId)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(offset, offset + limit);
    }
    async countByGuild(guildId) {
        return [...this.byId.values()].filter(r => r.guildId === guildId).length;
    }
}

describe('ReactionRolesService', () => {
    let svc, repo;
    beforeEach(() => {
        repo = new FakeRepo();
        svc = new ReactionRolesService(repo);
    });

    // ============== CREATE ==============

    test('create génère un id et persiste', async () => {
        const r = await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        assert.strictEqual(r.ok, true);
        assert.ok(r.data.id);
        assert.strictEqual(r.data.emoji, '🎉');
        assert.strictEqual(r.data.roleId, 'r1');
    });

    test('create rejette un emoji manquant', async () => {
        const r = await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '', roleId: 'r1' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'missing_params');
    });

    test('create rejette @everyone comme role', async () => {
        const r = await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'g1' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'cannot_use_everyone');
    });

    test('create rejette un doublon (meme message+emoji)', async () => {
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        const r = await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r2' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'already_exists');
    });

    test('create accepte deux emojis differents sur le meme message', async () => {
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        const r = await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '✅', roleId: 'r2' });
        assert.strictEqual(r.ok, true);
    });

    test('create normalise les emojis custom (objet {name,id})', async () => {
        const r = await svc.create({
            guildId: 'g1', channelId: 'c1', messageId: 'm1',
            emoji: { name: 'chienne', id: '12345' }, roleId: 'r1'
        });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.data.emoji, 'chienne:12345');
    });

    // ============== LIST / GET ==============

    test('listByMessage retourne les entries du message', async () => {
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '✅', roleId: 'r2' });
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm2', emoji: '🎉', roleId: 'r3' });
        const list = await svc.listByMessage('g1', 'm1');
        assert.strictEqual(list.length, 2);
    });

    test('get retourne la bonne entry', async () => {
        const created = await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        const got = await svc.get(created.data.id);
        assert.strictEqual(got.roleId, 'r1');
    });

    test('listByGuild retourne tout', async () => {
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm2', emoji: '🎉', roleId: 'r2' });
        await svc.create({ guildId: 'g2', channelId: 'c2', messageId: 'm3', emoji: '🎉', roleId: 'r3' });
        const list = await svc.list('g1', 50, 0);
        assert.strictEqual(list.length, 2);
    });

    // ============== UPDATE / DELETE ==============

    test('update modifie description', async () => {
        const created = await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        const updated = await svc.update(created.data.id, { description: 'Nouveau' });
        assert.strictEqual(updated.description, 'Nouveau');
    });

    test('delete supprime une entry', async () => {
        const created = await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        await svc.delete(created.data.id);
        const got = await svc.get(created.data.id);
        assert.strictEqual(got, null);
    });

    test('deleteByMessage supprime toutes les entries d\'un message', async () => {
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '✅', roleId: 'r2' });
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm2', emoji: '🎉', roleId: 'r3' });
        await svc.deleteByMessage('g1', 'm1');
        const remaining = await svc.listByMessage('g1', 'm1');
        assert.strictEqual(remaining.length, 0);
        const m2 = await svc.listByMessage('g1', 'm2');
        assert.strictEqual(m2.length, 1);
    });

    // ============== NORMALIZE / LOOKUP ==============

    test('normalizeEmoji gère string et objet', () => {
        assert.strictEqual(svc.normalizeEmoji('🎉'), '🎉');
        assert.strictEqual(svc.normalizeEmoji({ name: 'cat', id: '1' }), 'cat:1');
        assert.strictEqual(svc.normalizeEmoji({ name: 'unicode_emoji' }), 'unicode_emoji');
        assert.strictEqual(svc.normalizeEmoji(null), null);
    });

    test('findForReaction normalise avant lookup', async () => {
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: '🎉', roleId: 'r1' });
        const found = await svc.findForReaction('m1', { name: '🎉' });
        assert.ok(found);
        assert.strictEqual(found.roleId, 'r1');
    });

    test('findForReaction avec emoji custom', async () => {
        await svc.create({ guildId: 'g1', channelId: 'c1', messageId: 'm1', emoji: { name: 'chienne', id: '99' }, roleId: 'r1' });
        const found = await svc.findForReaction('m1', { name: 'chienne', id: '99' });
        assert.ok(found);
        assert.strictEqual(found.roleId, 'r1');
    });
});
