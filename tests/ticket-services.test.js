/**
 * Tests pour les services Tickets (Phase 3)
 */

const assert = require('node:assert');
const { TicketService, STATUS } = require('../src/modules/community_tickets/services/ticket.service.js');
const { TicketPermissionsService } = require('../src/modules/community_tickets/services/ticket-permissions.service.js');

class FakeRepo {
    constructor() {
        this.tickets = new Map();
        this.messages = [];
    }
    async insert(t) { this.tickets.set(t.id, { ...t }); return t; }
    async findById(id) { return this.tickets.get(id) || null; }
    async findByChannelId(cid) {
        for (const t of this.tickets.values()) {
            if (t.channelId === cid) return t;
        }
        return null;
    }
    async list({ guildId, status, userId, limit = 50, offset = 0 } = {}) {
        let all = [...this.tickets.values()];
        if (guildId) all = all.filter(t => t.guildId === guildId);
        if (status) all = all.filter(t => t.status === status);
        if (userId) all = all.filter(t => t.userId === userId);
        return all.sort((a, b) => b.createdAt - a.createdAt).slice(offset, offset + limit);
    }
    async count({ guildId, status, userId } = {}) {
        let all = [...this.tickets.values()];
        if (guildId) all = all.filter(t => t.guildId === guildId);
        if (status) all = all.filter(t => t.status === status);
        if (userId) all = all.filter(t => t.userId === userId);
        return all.length;
    }
    async update(id, fields) {
        const t = this.tickets.get(id);
        if (!t) return;
        Object.assign(t, fields);
    }
    async deleteByChannelId(cid) {
        let n = 0;
        for (const [id, t] of this.tickets) {
            if (t.channelId === cid) { this.tickets.delete(id); n++; }
        }
        return n;
    }
    async insertMessage(m) { this.messages.push(m); return m; }
    async findMessages(ticketId) { return this.messages.filter(m => m.ticketId === ticketId); }
}

describe('TicketService', () => {
    let svc, repo;

    beforeEach(() => {
        repo = new FakeRepo();
        svc = new TicketService();
        svc.setRepo(repo);
    });

    test('create génère un id et status open', async () => {
        const t = await svc.create({ guildId: 'g1', channelId: 'c1', userId: 'u1', category: 'support', subject: 'Help' });
        assert.ok(t.id);
        assert.strictEqual(t.status, STATUS.OPEN);
        const fetched = await svc.get(t.id);
        assert.strictEqual(fetched.channelId, 'c1');
        assert.strictEqual(fetched.subject, 'Help');
    });

    test('claim passe en claimed avec modUserId', async () => {
        const t = await svc.create({ guildId: 'g1', channelId: 'c1', userId: 'u1', category: 'support', subject: 'X' });
        const updated = await svc.claim(t.id, 'mod1');
        assert.strictEqual(updated.status, STATUS.CLAIMED);
        assert.strictEqual(updated.claimedBy, 'mod1');
    });

    test('unclaim remet en open', async () => {
        const t = await svc.create({ guildId: 'g1', channelId: 'c1', userId: 'u1', category: 'support' });
        await svc.claim(t.id, 'mod1');
        const updated = await svc.unclaim(t.id);
        assert.strictEqual(updated.status, STATUS.OPEN);
        assert.strictEqual(updated.claimedBy, null);
    });

    test('close passe en closed avec closerUserId et closedAt', async () => {
        const t = await svc.create({ guildId: 'g1', channelId: 'c1', userId: 'u1', category: 'support' });
        const updated = await svc.close(t.id, 'mod1');
        assert.strictEqual(updated.status, STATUS.CLOSED);
        assert.strictEqual(updated.closedBy, 'mod1');
        assert.ok(updated.closedAt);
    });

    test('reopen remet en open', async () => {
        const t = await svc.create({ guildId: 'g1', channelId: 'c1', userId: 'u1', category: 'support' });
        await svc.close(t.id, 'mod1');
        const updated = await svc.reopen(t.id);
        assert.strictEqual(updated.status, STATUS.OPEN);
        assert.strictEqual(updated.closedBy, null);
    });

    test('list filtre par status, userId, guildId', async () => {
        await svc.create({ guildId: 'g1', channelId: 'c1', userId: 'u1', category: 'support' });
        await svc.create({ guildId: 'g1', channelId: 'c2', userId: 'u2', category: 'report' });
        await svc.create({ guildId: 'g2', channelId: 'c3', userId: 'u1', category: 'support' });
        const g1 = await svc.list({ guildId: 'g1' });
        assert.strictEqual(g1.length, 2);
        const u1 = await svc.list({ userId: 'u1' });
        assert.strictEqual(u1.length, 2);
    });

    test('countOpenByUser compte uniquement les open', async () => {
        const t1 = await svc.create({ guildId: 'g1', channelId: 'c1', userId: 'u1', category: 'support' });
        const t2 = await svc.create({ guildId: 'g1', channelId: 'c2', userId: 'u1', category: 'support' });
        await svc.close(t2.id, 'mod1');
        const count = await svc.countOpenByUser('g1', 'u1');
        assert.strictEqual(count, 1);
    });

    test('logMessage ajoute un message et getMessages le récupère', async () => {
        const t = await svc.create({ guildId: 'g1', channelId: 'c1', userId: 'u1', category: 'support' });
        await svc.logMessage({ ticketId: t.id, authorId: 'u1', content: 'Hello', isStaff: false });
        await svc.logMessage({ ticketId: t.id, authorId: 'mod1', content: 'Hi', isStaff: true });
        const msgs = await svc.getMessages(t.id);
        assert.strictEqual(msgs.length, 2);
        assert.strictEqual(msgs[0].content, 'Hello');
        assert.strictEqual(msgs[1].isStaff, 1);
    });
});

describe('TicketPermissionsService', () => {
    let svc;
    beforeEach(() => { svc = new TicketPermissionsService(); });

    test('buildOverwrites bloque everyone, autorise user + staff', () => {
        const guild = { roles: { everyone: { id: 'EVERYONE' } } };
        const user = { id: 'user1' };
        const overwrites = svc.buildOverwrites(guild, user, ['staff1', 'staff2']);
        assert.strictEqual(overwrites.length, 4);
        const everyoneOw = overwrites.find(o => o.id === 'EVERYONE');
        assert.ok(everyoneOw.deny.length > 0);
        assert.ok(overwrites.find(o => o.id === 'user1'));
        assert.ok(overwrites.find(o => o.id === 'staff1'));
        assert.ok(overwrites.find(o => o.id === 'staff2'));
    });

    test('buildOverwrites sans staff', () => {
        const guild = { roles: { everyone: { id: 'EVERYONE' } } };
        const user = { id: 'u1' };
        const overwrites = svc.buildOverwrites(guild, user, []);
        assert.strictEqual(overwrites.length, 2);
    });

    test('isStaff true pour admin', () => {
        const member = {
            permissions: { has: (perm) => perm === 8n }
        };
        const r = svc.isStaff(member);
        assert.strictEqual(r, true);
    });

    test('isStaff false pour membre sans rôle staff', () => {
        const member = {
            permissions: { has: () => false },
            roles: { cache: { has: () => false } }
        };
        const r = svc.isStaff(member, ['staff1']);
        assert.strictEqual(r, false);
    });

    test('isStaff true si possède un rôle staff', () => {
        const member = {
            permissions: { has: () => false },
            roles: { cache: { has: (id) => id === 'staff1' } }
        };
        const r = svc.isStaff(member, ['staff1']);
        assert.strictEqual(r, true);
    });

    test('isOwner vérifie userId', () => {
        assert.strictEqual(svc.isOwner({ id: 'u1' }, 'u1'), true);
        assert.strictEqual(svc.isOwner({ id: 'u2' }, 'u1'), false);
    });

    test('isOwnerOrStaff combine', () => {
        assert.strictEqual(svc.isOwnerOrStaff({ id: 'u1' }, 'u1', []), true);
        const staff = { id: 'mod1', permissions: { has: () => true }, roles: { cache: { has: () => false } } };
        assert.strictEqual(svc.isOwnerOrStaff(staff, 'u1', []), true);
        const other = { id: 'u2', permissions: { has: () => false }, roles: { cache: { has: () => false } } };
        assert.strictEqual(svc.isOwnerOrStaff(other, 'u1', []), false);
    });
});
