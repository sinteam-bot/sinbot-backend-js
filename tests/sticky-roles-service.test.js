/**
 * Tests for the StickyRolesService (Phase 8)
 */

const assert = require('node:assert');
const { StickyRolesService } = require('../src/modules/feature_sticky-roles/services/sticky-roles.service.js');

class FakeRepo {
    constructor() {
        this.byUser = new Map(); // key: `g::u` -> Map(roleId -> entry)
    }
    _k(g, u) { return `${g}::${u}`; }
    async saveRoles(guildId, userId, roleIds) {
        if (!roleIds || roleIds.length === 0) return;
        const k = this._k(guildId, userId);
        if (!this.byUser.has(k)) this.byUser.set(k, new Map());
        const map = this.byUser.get(k);
        const now = Date.now();
        for (const r of roleIds) map.set(r, { roleId: r, savedAt: now });
    }
    async listForUser(guildId, userId) {
        const map = this.byUser.get(this._k(guildId, userId));
        return map ? Array.from(map.values()) : [];
    }
    async clear(guildId, userId) {
        this.byUser.delete(this._k(guildId, userId));
    }
    async removeRole(guildId, userId, roleId) {
        const map = this.byUser.get(this._k(guildId, userId));
        if (map) map.delete(roleId);
    }
    async countForUser(guildId, userId) {
        const map = this.byUser.get(this._k(guildId, userId));
        return map ? map.size : 0;
    }
}

function makeMember(roles, options = {}) {
    return {
        id: options.id || '111',
        user: { id: options.id || '111', bot: !!options.bot, username: 'u' },
        roles: {
            cache: new Map(roles.map(r => [r.id, r])),
            highest: { position: 100 }
        }
    };
}

function makeGuild(roles) {
    return {
        id: 'g1',
        roles: { fetch: async () => new Map(roles.map(r => [r.id, r])) }
    };
}

describe('StickyRolesService', () => {
    let svc, repo;
    beforeEach(() => { repo = new FakeRepo(); svc = new StickyRolesService(repo); });

    test('addRole enregistre et respecte max_per_user', async () => {
        const cfg = { max_per_user: 2 };
        assert.strictEqual((await svc.addRole('g1', 'u1', 'r1', cfg)).ok, true);
        assert.strictEqual((await svc.addRole('g1', 'u1', 'r2', cfg)).ok, true);
        const r = await svc.addRole('g1', 'u1', 'r3', cfg);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'max_per_user_reached');
    });

    test('removeRole puis addRole autorise un nouveau rôle', async () => {
        const cfg = { max_per_user: 2 };
        await svc.addRole('g1', 'u1', 'r1', cfg);
        await svc.addRole('g1', 'u1', 'r2', cfg);
        await svc.removeRole('g1', 'u1', 'r1');
        const r = await svc.addRole('g1', 'u1', 'r3', cfg);
        assert.strictEqual(r.ok, true);
    });

    test('listForUser retourne la liste', async () => {
        await svc.addRole('g1', 'u1', 'r1', { max_per_user: 5 });
        await svc.addRole('g1', 'u1', 'r2', { max_per_user: 5 });
        const list = await svc.listForUser('g1', 'u1');
        assert.strictEqual(list.length, 2);
        const roleIds = list.map(l => l.roleId);
        assert.ok(roleIds.includes('r1'));
        assert.ok(roleIds.includes('r2'));
    });

    test('clearForUser vide la liste', async () => {
        await svc.addRole('g1', 'u1', 'r1', { max_per_user: 5 });
        await svc.addRole('g1', 'u1', 'r2', { max_per_user: 5 });
        await svc.clearForUser('g1', 'u1');
        const list = await svc.listForUser('g1', 'u1');
        assert.strictEqual(list.length, 0);
    });

    test('snapshotOnLeave exclut @everyone et les roles > bot', async () => {
        // Setup : roles r1 (pos 50), r2 (pos 80), everyone (pos 0), r3 (pos 200 > bot)
        const guild = { id: 'g1' };
        const member = makeMember([
            { id: 'g1', name: '@everyone', position: 0 },
            { id: 'r1', name: 'Member', position: 50 },
            { id: 'r2', name: 'VIP', position: 80 },
            { id: 'r3', name: 'Admin', position: 200 }
        ]);
        guild.members = { fetchMe: async () => ({ roles: { highest: { position: 100 } } }) };
        const r = await svc.snapshotOnLeave(guild, member);
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.saved, 2); // r1, r2 (everyone + r3 excluded)
        const list = await svc.listForUser('g1', member.id);
        const ids = list.map(l => l.roleId);
        assert.ok(!ids.includes('g1')); // pas @everyone
        assert.ok(!ids.includes('r3')); // pas > bot
        assert.ok(ids.includes('r1'));
        assert.ok(ids.includes('r2'));
    });

    test('restoreOnJoin re-attribue les rôles encore présents', async () => {
        // On snapshot d'abord
        const guild = { id: 'g1' };
        const oldMember = makeMember([
            { id: 'g1', name: '@everyone', position: 0 },
            { id: 'r1', name: 'Member', position: 50 },
            { id: 'r2', name: 'VIP', position: 80 }
        ]);
        guild.members = { fetchMe: async () => ({ roles: { highest: { position: 100 } } }) };
        await svc.snapshotOnLeave(guild, oldMember);

        // Le member revient
        const newMember = {
            id: oldMember.id,
            user: oldMember.user,
            roles: { cache: new Map(), add: async (rid) => { newMember.roles.cache.set(rid, { id: rid }); } }
        };
        // r2 a été supprimé entre temps
        const guildAfter = makeGuild([{ id: 'r1', name: 'Member', position: 50 }]);
        guildAfter.id = 'g1';
        guildAfter.members = { fetchMe: async () => ({ roles: { highest: { position: 100 } } }) };
        const r = await svc.restoreOnJoin(guildAfter, newMember, { max_per_user: 5 });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.restored, 1);
        // r2 doit être nettoyé de la BDD
        const list = await svc.listForUser('g1', oldMember.id);
        assert.strictEqual(list.length, 1);
        assert.strictEqual(list[0].roleId, 'r1');
    });

    test('restoreOnJoin skip les rôles > bot', async () => {
        const guild = { id: 'g1' };
        const oldMember = makeMember([
            { id: 'g1', name: '@everyone', position: 0 },
            { id: 'r1', name: 'Member', position: 50 }
        ]);
        guild.members = { fetchMe: async () => ({ roles: { highest: { position: 100 } } }) };
        await svc.snapshotOnLeave(guild, oldMember);

        // r1 a été bougé au-dessus du bot
        const guildAfter = { id: 'g1' };
        guildAfter.roles = { fetch: async () => new Map([['r1', { id: 'r1', position: 200 }]]) };
        guildAfter.members = { fetchMe: async () => ({ roles: { highest: { position: 100 } } }) };
        const newMember = {
            id: oldMember.id,
            roles: { cache: new Map(), add: async () => { throw new Error('should not be called'); } }
        };
        const r = await svc.restoreOnJoin(guildAfter, newMember, { max_per_user: 5 });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.restored, 0);
    });
});
