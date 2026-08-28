/**
const { test, describe, beforeAll, afterAll, beforeEach } = require("vitest");
 * Tests for the Economy, Shop and Inventory services (Phase 9)
 */

const assert = require('node:assert');
const { EconomyService } = require('../src/modules/feature_economy/services/economy.service.js');
const { ShopService } = require('../src/modules/feature_economy/services/shop.service.js');
const { InventoryService } = require('../src/modules/feature_economy/services/inventory.service.js');

/**
 * FakeRepo: in-memory simulation of EconomyRepository
 */
class FakeRepo {
    constructor() {
        this.balances = new Map();  // key: `${guildId}::${userId}`
        this.transactions = [];
        this.items = new Map();     // key: item.id
        this.inventory = new Map(); // key: `${guildId}::${userId}::${itemId}`
        this.drops = new Map();     // key: drop.id
        this.transfers = [];
    }
    _k(g, u) { return `${g}::${u}`; }
    _ki(g, u, i) { return `${g}::${u}::${i}`; }

    async getBalance(guildId, userId) {
        const k = this._k(guildId, userId);
        return this.balances.has(k) ? { ...this.balances.get(k) } : null;
    }
    async upsertBalance(guildId, userId, fields) {
        const k = this._k(guildId, userId);
        const existing = this.balances.get(k) || {
            userId, guildId, balance: 0, bankBalance: 0,
            lastDailyClaimAt: null, totalEarned: 0, totalSpent: 0,
            createdAt: Date.now(), updatedAt: Date.now()
        };
        const next = { ...existing, ...fields, updatedAt: Date.now() };
        this.balances.set(k, next);
        return next;
    }
    async leaderboard(guildId, limit) {
        return [...this.balances.values()].filter(b => b.guildId === guildId).sort((a, b) => b.balance - a.balance).slice(0, limit);
    }
    async insertTransaction(t) { const id = t.id || 'tx_' + Math.random(); this.transactions.push({ id, ...t }); return { id, ...t }; }
    async listTransactions(guildId, userId, limit = 50) {
        return this.transactions.filter(t => t.guildId === guildId && t.userId === userId).slice(0, limit);
    }
    async insertItem(item) { const it = { id: item.id || 'item_' + Math.random(), isTradeable: true, isDroppable: true, ...item }; this.items.set(it.id, it); return it; }
    async getItem(id) { return this.items.get(id) || null; }
    async updateItem(id, fields) { const it = this.items.get(id); if (it) Object.assign(it, fields); return it; }
    async deleteItem(id) { this.items.delete(id); }
    async listItems(guildId, limit = 100, offset = 0) {
        return [...this.items.values()].filter(i => i.guildId === guildId).slice(offset, offset + limit);
    }
    async countItems(guildId) { return [...this.items.values()].filter(i => i.guildId === guildId).length; }
    async getItemByName(guildId, name) {
        return [...this.items.values()].find(i => i.guildId === guildId && i.name.toLowerCase() === name.toLowerCase()) || null;
    }
    async getInventoryEntry(guildId, userId, itemId) {
        const k = this._ki(guildId, userId, itemId);
        return this.inventory.has(k) ? { ...this.inventory.get(k) } : null;
    }
    async addToInventory(guildId, userId, itemId, quantity = 1) {
        const k = this._ki(guildId, userId, itemId);
        const existing = this.inventory.get(k);
        if (existing) { existing.quantity += quantity; existing.acquiredAt = Date.now(); return existing; }
        const entry = { userId, guildId, itemId, quantity, acquiredAt: Date.now() };
        this.inventory.set(k, entry); return entry;
    }
    async removeFromInventory(guildId, userId, itemId, quantity = 1) {
        const k = this._ki(guildId, userId, itemId);
        const existing = this.inventory.get(k);
        if (!existing) return { ok: false, reason: 'not_in_inventory' };
        if (existing.quantity < quantity) return { ok: false, reason: 'insufficient_quantity' };
        if (existing.quantity === quantity) { this.inventory.delete(k); }
        else { existing.quantity -= quantity; }
        return { ok: true };
    }
    async listInventory(guildId, userId) {
        return [...this.inventory.values()].filter(e => e.guildId === guildId && e.userId === userId);
    }
    async listHolders(guildId, itemId) {
        return [...this.inventory.values()].filter(e => e.guildId === guildId && e.itemId === itemId && e.quantity > 0);
    }
    async insertDrop(d) { const id = d.id || 'drop_' + Math.random(); const drop = { ...d, id, status: d.status || 'active' }; this.drops.set(id, drop); return drop; }
    async updateDrop(id, fields) { const d = this.drops.get(id); if (d) Object.assign(d, fields); return d; }
    async getDrop(id) { return this.drops.get(id) || null; }
    async getDropByMessageId(mid) {
        return [...this.drops.values()].find(d => d.messageId === mid && d.status === 'active') || null;
    }
    async listActiveDrops(guildId, limit) {
        return [...this.drops.values()].filter(d => d.guildId === guildId && d.status === 'active').slice(0, limit);
    }
    async listDueDrops(limit) {
        const now = Date.now();
        return [...this.drops.values()].filter(d => d.status === 'active' && d.expiresAt <= now).slice(0, limit);
    }
    async insertTransfer(t) { const id = t.id || 'tr_' + Math.random(); this.transfers.push({ id, ...t }); return { id, ...t }; }
    async listTransfers(guildId, userId, limit = 50) {
        return this.transfers.filter(t => t.guildId === guildId && (!userId || t.fromUserId === userId || t.toUserId === userId)).slice(0, limit);
    }
}

describe('EconomyService', () => {
    let svc, repo;
    beforeEach(() => { repo = new FakeRepo(); svc = new EconomyService(repo); });

    test('getOrInitBalance crée une balance à 0', async () => {
        const b = await svc.getOrInitBalance('g1', 'u1');
        assert.strictEqual(b.balance, 0);
        assert.strictEqual(b.totalEarned, 0);
    });

    test('add crédite et log une transaction', async () => {
        const r = await svc.add('g1', 'u1', 100, { type: 'admin' });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.balance, 100);
        const txs = await svc.listTransactions('g1', 'u1');
        assert.strictEqual(txs.length, 1);
        assert.strictEqual(txs[0].type, 'admin');
    });

    test('add refuse amount <= 0', async () => {
        const r = await svc.add('g1', 'u1', 0);
        assert.strictEqual(r.ok, false);
    });

    test('remove débite si balance suffisante', async () => {
        await svc.add('g1', 'u1', 200);
        const r = await svc.remove('g1', 'u1', 50, { type: 'shop' });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.balance, 150);
    });

    test('remove refuse si balance insuffisante', async () => {
        await svc.add('g1', 'u1', 10);
        const r = await svc.remove('g1', 'u1', 100);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'insufficient_balance');
    });

    test('claimDaily crédite et bloque le cooldown', async () => {
        const r1 = await svc.claimDaily('g1', 'u1', { daily_reward: 100, cooldown_hours: 22 });
        assert.strictEqual(r1.ok, true);
        assert.strictEqual(r1.balance, 100);
        const r2 = await svc.claimDaily('g1', 'u1', { daily_reward: 100, cooldown_hours: 22 });
        assert.strictEqual(r2.ok, false);
        assert.strictEqual(r2.error, 'cooldown');
    });

    test('transfer déplace la monnaie entre users', async () => {
        await svc.add('g1', 'u1', 200);
        const r = await svc.transfer('g1', 'u1', 'u2', 100, { reason: 'cadeau' });
        assert.strictEqual(r.ok, true);
        const u1 = await svc.getBalance('g1', 'u1');
        const u2 = await svc.getBalance('g1', 'u2');
        assert.strictEqual(u1.balance, 100);
        assert.strictEqual(u2.balance, 100);
    });

    test('transfer refuse si sender insolvable', async () => {
        const r = await svc.transfer('g1', 'u1', 'u2', 100);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'insufficient_balance');
    });

    test('transfer avec taxe réduit le net', async () => {
        await svc.add('g1', 'u1', 200);
        const r = await svc.transfer('g1', 'u1', 'u2', 100, { taxPercent: 10 });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.net, 90);
    });

    test('leaderboard trie par balance DESC', async () => {
        await svc.add('g1', 'a', 100);
        await svc.add('g1', 'b', 300);
        await svc.add('g1', 'c', 200);
        const lb = await svc.leaderboard('g1', 10);
        assert.strictEqual(lb[0].userId, 'b');
        assert.strictEqual(lb[1].userId, 'c');
        assert.strictEqual(lb[2].userId, 'a');
    });
});

describe('ShopService', () => {
    let svc, repo;
    beforeEach(() => { repo = new FakeRepo(); svc = new ShopService(repo, new EconomyService(repo)); });

    test('create enregistre un item', async () => {
        const r = await svc.create({ guildId: 'g1', name: 'Potion', price: 50 });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.data.price, 50);
    });

    test('create refuse prix < 0', async () => {
        const r = await svc.create({ guildId: 'g1', name: 'X', price: -1 });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'invalid_price');
    });

    test('list trie par prix ASC', async () => {
        await svc.create({ guildId: 'g1', name: 'Cheap', price: 10 });
        await svc.create({ guildId: 'g1', name: 'Expensive', price: 1000 });
        const list = await svc.list('g1');
        assert.strictEqual(list[0].name, 'Cheap');
    });

    test('buy débite l\'économie et ajoute à l\'inventaire', async () => {
        const eco = new EconomyService(repo);
        await eco.add('g1', 'u1', 500);
        const item = (await svc.create({ guildId: 'g1', name: 'Potion', price: 100 })).data;
        const r = await svc.buy('g1', 'u1', item.id);
        assert.strictEqual(r.ok, true);
        const u1 = await eco.getBalance('g1', 'u1');
        assert.strictEqual(u1.balance, 400);
        const inv = await repo.listInventory('g1', 'u1');
        assert.strictEqual(inv.length, 1);
        assert.strictEqual(inv[0].itemId, item.id);
    });

    test('buy refuse si item not_tradeable', async () => {
        const eco = new EconomyService(repo);
        await eco.add('g1', 'u1', 500);
        const item = (await svc.create({ guildId: 'g1', name: 'Unique', price: 100, isTradeable: false })).data;
        const r = await svc.buy('g1', 'u1', item.id);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'item_not_tradeable');
    });

    test('buy refuse si balance insuffisante', async () => {
        const item = (await svc.create({ guildId: 'g1', name: 'Potion', price: 100 })).data;
        const r = await svc.buy('g1', 'u1', item.id);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'insufficient_balance');
    });
});

describe('InventoryService', () => {
    let svc, repo, eco, shop;
    beforeEach(() => {
        repo = new FakeRepo();
        eco = new EconomyService(repo);
        shop = new ShopService(repo, eco);
        svc = new InventoryService(repo, shop);
    });

    test('give transfère un item entre users', async () => {
        const item = (await shop.create({ guildId: 'g1', name: 'P', price: 10 })).data;
        await repo.addToInventory('g1', 'u1', item.id, 5);
        const r = await svc.give({ guildId: 'g1', fromUserId: 'u1', toUserId: 'u2', itemId: item.id, quantity: 2 });
        assert.strictEqual(r.ok, true);
        const from = await repo.getInventoryEntry('g1', 'u1', item.id);
        const to = await repo.getInventoryEntry('g1', 'u2', item.id);
        assert.strictEqual(from.quantity, 3);
        assert.strictEqual(to.quantity, 2);
    });

    test('give refuse si sender n\'a pas l\'item', async () => {
        const item = (await shop.create({ guildId: 'g1', name: 'P', price: 10 })).data;
        const r = await svc.give({ guildId: 'g1', fromUserId: 'u1', toUserId: 'u2', itemId: item.id, quantity: 1 });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'sender_does_not_own');
    });

    test('sell transfère l\'item + monnaie', async () => {
        const item = (await shop.create({ guildId: 'g1', name: 'P', price: 10 })).data;
        await eco.add('g1', 'u2', 200);
        await repo.addToInventory('g1', 'u1', item.id, 3);
        const r = await svc.sell({ guildId: 'g1', sellerId: 'u1', buyerId: 'u2', itemId: item.id, quantity: 1, price: 50 });
        assert.strictEqual(r.ok, true);
        const u1 = await eco.getBalance('g1', 'u1');
        const u2 = await eco.getBalance('g1', 'u2');
        assert.strictEqual(u1.balance, 50);
        assert.strictEqual(u2.balance, 150);
    });

    test('sell refuse si vendeur n\'a pas l\'item', async () => {
        const item = (await shop.create({ guildId: 'g1', name: 'P', price: 10 })).data;
        const r = await svc.sell({ guildId: 'g1', sellerId: 'u1', buyerId: 'u2', itemId: item.id, quantity: 1, price: 50 });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, 'seller_does_not_own');
    });

    test('startDrop + claimDrop transfère l\'item', async () => {
        const item = (await shop.create({ guildId: 'g1', name: 'Loot', price: 100 })).data;
        const drop = await svc.startDrop({ guildId: 'g1', channelId: 'c1', itemId: item.id, quantity: 1, durationMinutes: 5 });
        assert.ok(drop.id);
        const r = await svc.claimDrop(drop.id, 'u1');
        assert.strictEqual(r.ok, true);
        const inv = await repo.listInventory('g1', 'u1');
        assert.strictEqual(inv.length, 1);
    });

    test('claimDrop refuse si déjà claim', async () => {
        const item = (await shop.create({ guildId: 'g1', name: 'Loot', price: 100 })).data;
        const drop = await svc.startDrop({ guildId: 'g1', channelId: 'c1', itemId: item.id, quantity: 1, durationMinutes: 5 });
        await svc.claimDrop(drop.id, 'u1');
        const r2 = await svc.claimDrop(drop.id, 'u2');
        assert.strictEqual(r2.ok, false);
        assert.strictEqual(r2.error, 'drop_already_claimed');
    });

    test('expireDueDrops marque les drops到期 comme expired', async () => {
        const item = (await shop.create({ guildId: 'g1', name: 'L', price: 10 })).data;
        // Crée un drop déjà expiré
        const drop = await svc.startDrop({ guildId: 'g1', channelId: 'c1', itemId: item.id, quantity: 1, durationMinutes: 0 });
        // Force expiration
        const got = await repo.getDrop(drop.id);
        got.expiresAt = Date.now() - 1000;
        const r = await svc.expireDueDrops();
        assert.strictEqual(r.expired, 1);
        const after = await repo.getDrop(drop.id);
        assert.strictEqual(after.status, 'expired');
    });

    test('listInventory retourne les items d\'un user', async () => {
        const item = (await shop.create({ guildId: 'g1', name: 'A', price: 10 })).data;
        await repo.addToInventory('g1', 'u1', item.id, 2);
        const inv = await svc.listInventory('g1', 'u1');
        assert.strictEqual(inv.length, 1);
        assert.strictEqual(inv[0].quantity, 2);
    });
});
