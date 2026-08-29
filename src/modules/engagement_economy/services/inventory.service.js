/**
 * inventory.service.js — gestion de l'inventaire + drops + transferts
 *
 * - give(guild, fromUserId, toUserId, itemId, qty, { price, type })
 * - sell(guildId, sellerId, buyerId, itemId, qty, price) : transfere + crédite
 * - trade(guildId, fromUserId, toUserId, itemId, qty)
 * - drop(guild, item, { quantity, duration, channel, message })
 * - claimDrop(guild, dropId, userId)
 * - expireDueDrops() (cron-friendly)
 * - listInventory, listHolders, listTransfers
 */

const { Injectable } = require('../../../core/index.js');
const { EconomyRepository } = require('./economy.repository.js');
const { ShopService } = require('./shop.service.js');
const { EconomyService } = require('./economy.service.js');

class InventoryService {
    static inject = [EconomyRepository, ShopService, EconomyService];

    constructor(repo, shop, economy) {
        this.repo = repo;
        this.shop = shop;
        this.economy = economy;
        this._client = null;
    }

    setClient(client) {
        this._client = client;
        this.shop.setClient(client);
    }

    /**
     * Donne un item d'un user à un autre
     */
    async give({ guildId, fromUserId, toUserId, itemId, quantity = 1, price = null, type = 'give' }) {
        if (!guildId || !fromUserId || !toUserId || !itemId) {
            return { ok: false, error: 'missing_params' };
        }
        const from = await this.repo.getInventoryEntry(guildId, fromUserId, itemId);
        if (!from) return { ok: false, error: 'sender_does_not_own' };
        if (from.quantity < quantity) return { ok: false, error: 'insufficient_quantity' };

        const item = await this.repo.getItem(itemId);
        if (item && !item.isTradeable && type !== 'admin') {
            return { ok: false, error: 'item_not_tradeable' };
        }

        const removed = await this.repo.removeFromInventory(guildId, fromUserId, itemId, quantity);
        if (!removed.ok) return removed;

        const added = await this.repo.addToInventory(guildId, toUserId, itemId, quantity);
        await this.repo.insertTransfer({
            guildId, fromUserId, toUserId, itemId, quantity, type, price
        });
        return { ok: true, data: { removed, added } };
    }

    /**
     * Vend un item d'un user à un autre pour un prix donné (crédite le vendeur)
     */
    async sell({ guildId, sellerId, buyerId, itemId, quantity = 1, price }) {
        if (!price || price <= 0) return { ok: false, error: 'invalid_price' };
        if (sellerId === buyerId) return { ok: false, error: 'cannot_sell_to_self' };

        // Vérifier que le buyer a la monnaie
        const { EconomyService } = require('./economy.service.js');
        // (Le check de balance est fait dans transfer du buyer)
        const seller = await this.repo.getInventoryEntry(guildId, sellerId, itemId);
        if (!seller) return { ok: false, error: 'seller_does_not_own' };
        if (seller.quantity < quantity) return { ok: false, error: 'insufficient_quantity' };

        const item = await this.repo.getItem(itemId);
        if (item && !item.isTradeable) return { ok: false, error: 'item_not_tradeable' };

        // Le buyer paie, le seller reçoit
        const economy = new EconomyService(this.repo);
        const deduct = await economy.remove(guildId, buyerId, price, { type: 'buy', reason: `buy_item:${itemId}` });
        if (!deduct.ok) return deduct;
        await economy.add(guildId, sellerId, price, { type: 'sell', reason: `sell_item:${itemId}` });

        // Transfert d'item
        await this.repo.removeFromInventory(guildId, sellerId, itemId, quantity);
        await this.repo.addToInventory(guildId, buyerId, itemId, quantity);
        await this.repo.insertTransfer({
            guildId, fromUserId: sellerId, toUserId: buyerId, itemId, quantity,
            type: 'sell', price
        });
        return { ok: true };
    }

    /**
     * Échange (give) entre deux users sans transaction monétaire
     */
    async trade({ guildId, fromUserId, toUserId, itemId, quantity = 1 }) {
        return this.give({ guildId, fromUserId, toUserId, itemId, quantity, type: 'trade' });
    }

    /**
     * Démarre un drop
     */
    async startDrop({ guildId, channelId, itemId, quantity = 1, durationMinutes = 2 }) {
        const now = Date.now();
        return this.repo.insertDrop({
            guildId, channelId, itemId, quantity,
            startedAt: now,
            expiresAt: now + durationMinutes * 60_000,
            status: 'active'
        });
    }

    async setDropMessageId(dropId, messageId) {
        await this.repo.updateDrop(dropId, { message_id: messageId });
    }

    async getDrop(dropId) {
        return this.repo.getDrop(dropId);
    }

    async getDropByMessage(messageId) {
        return this.repo.getDropByMessageId(messageId);
    }

    /**
     * Claim un drop. Retourne success/failure.
     */
    async claimDrop(dropId, userId) {
        const drop = await this.repo.getDrop(dropId);
        if (!drop) return { ok: false, error: 'drop_not_found' };
        if (drop.claimedBy || drop.status === 'claimed') return { ok: false, error: 'drop_already_claimed' };
        if (drop.status !== 'active') return { ok: false, error: 'drop_not_active' };
        if (drop.expiresAt < Date.now()) return { ok: false, error: 'drop_expired' };

        await this.repo.updateDrop(dropId, {
            claimed_by: userId,
            claimed_at: Date.now(),
            status: 'claimed'
        });
        await this.repo.addToInventory(drop.guildId, userId, drop.itemId, drop.quantity);
        await this.repo.insertTransfer({
            guildId: drop.guildId,
            fromUserId: 'system',
            toUserId: userId,
            itemId: drop.itemId,
            quantity: drop.quantity,
            type: 'drop'
        });
        return { ok: true, data: drop };
    }

    /**
     * Expire les drops到期 (appelé par le cron)
     */
    async expireDueDrops() {
        const due = await this.repo.listDueDrops(50);
        let count = 0;
        for (const drop of due) {
            await this.repo.updateDrop(drop.id, { status: 'expired' });
            count++;
        }
        return { expired: count };
    }

    async listInventory(guildId, userId) {
        return this.repo.listInventory(guildId, userId);
    }

    async listHolders(guildId, itemId) {
        return this.repo.listHolders(guildId, itemId);
    }

    async listTransfers(guildId, userId) {
        return this.repo.listTransfers(guildId, userId);
    }
}

Injectable()(InventoryService);

module.exports = { InventoryService };
