/**
 * EconomyController — REST endpoints pour la feature Économie & Inventaire
 *
 * Économie:
 *   GET   /api/economy/balance/:userId
 *   POST  /api/economy/daily
 *   POST  /api/economy/pay
 *   GET   /api/economy/leaderboard
 *   GET   /api/economy/transactions/:userId
 *   POST  /api/economy/admin/add
 *   POST  /api/economy/admin/remove
 *
 * Shop:
 *   GET    /api/shop
 *   POST   /api/shop
 *   PATCH  /api/shop/:id
 *   DELETE /api/shop/:id
 *
 * Inventaire:
 *   GET   /api/inventory/:userId
 *   POST  /api/inventory/give
 *   POST  /api/inventory/sell
 *   POST  /api/inventory/transfer
 *   POST  /api/inventory/reset
 *   POST  /api/inventory/drop
 *   POST  /api/inventory/drop/:id/claim
 *   GET   /api/inventory/holders/:itemId
 *   GET   /api/inventory/transfers
 */

const { Controller, Get, Post, Put, Patch, Delete } = require('../../../core/index.js');
const { EconomyService } = require('../services/economy.service.js');
const { ShopService } = require('../services/shop.service.js');
const { InventoryService } = require('../services/inventory.service.js');

class EconomyController {
    static inject = [EconomyService, ShopService, InventoryService];

    constructor(economy, shop, inventory) {
        this.economy = economy;
        this.shop = shop;
        this.inventory = inventory;
    }

    // ============== ECONOMY ==============

    async getBalance(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const userId = req.params.userId;
            if (!guildId || !userId) return { success: false, error: 'guild_id et userId requis' };
            const b = await this.economy.getOrInitBalance(guildId, userId);
            return { success: true, data: b };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async claimDaily(req) {
        try {
            const guildId = req.body.guildId || process.env.GUILD_ID;
            const userId = req.body.userId;
            if (!guildId || !userId) return { success: false, error: 'guildId et userId requis' };
            const r = await this.economy.claimDaily(guildId, userId, this._config());
            return { success: r.ok, data: r, error: r.error || null };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async pay(req) {
        try {
            const guildId = req.body.guildId || process.env.GUILD_ID;
            const { fromUserId, toUserId, amount } = req.body;
            const r = await this.economy.transfer(guildId, fromUserId, toUserId, amount, { taxPercent: this._config().tax_percent || 0 });
            return { success: r.ok, data: r, error: r.error || null };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async leaderboard(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const limit = Math.min(parseInt(req.query.limit) || 50, 200);
            const data = await this.economy.leaderboard(guildId, limit);
            return { success: true, data };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async transactions(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const data = await this.economy.listTransactions(guildId, req.params.userId, 50);
            return { success: true, data };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async adminAdd(req) {
        try {
            const r = await this.economy.add(req.body.guildId, req.body.userId, req.body.amount, { type: 'admin' });
            return { success: r.ok, data: r, error: r.error || null };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async adminRemove(req) {
        try {
            const r = await this.economy.remove(req.body.guildId, req.body.userId, req.body.amount, { type: 'admin' });
            return { success: r.ok, data: r, error: r.error || null };
        } catch (err) { return { success: false, error: err.message }; }
    }

    // ============== SHOP ==============

    async listShop(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const data = await this.shop.list(guildId, 100, 0);
            return { success: true, data };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async createShopItem(req) {
        try {
            const r = await this.shop.create({
                guildId: req.body.guildId || process.env.GUILD_ID,
                name: req.body.name,
                description: req.body.description,
                emoji: req.body.emoji,
                price: req.body.price,
                roleRewardId: req.body.roleRewardId,
                xpReward: req.body.xpReward,
                isTradeable: req.body.isTradeable,
                isDroppable: req.body.isDroppable,
                maxPerUser: req.body.maxPerUser
            });
            return { success: r.ok, data: r.data, error: r.error || null };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async updateShopItem(req) {
        try {
            const r = await this.shop.update(req.params.id, req.body || {});
            return { success: !!r, data: r };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async deleteShopItem(req) {
        try {
            await this.shop.delete(req.params.id);
            return { success: true };
        } catch (err) { return { success: false, error: err.message }; }
    }

    // ============== INVENTORY ==============

    async getInventory(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const data = await this.inventory.listInventory(guildId, req.params.userId);
            return { success: true, data };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async giveItem(req) {
        try {
            const r = await this.inventory.give({
                guildId: req.body.guildId,
                fromUserId: req.body.fromUserId,
                toUserId: req.body.toUserId,
                itemId: req.body.itemId,
                quantity: req.body.quantity || 1,
                type: req.body.type
            });
            return { success: r.ok, data: r, error: r.error || null };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async sellItem(req) {
        try {
            const r = await this.inventory.sell({
                guildId: req.body.guildId,
                sellerId: req.body.sellerId,
                buyerId: req.body.buyerId,
                itemId: req.body.itemId,
                quantity: req.body.quantity || 1,
                price: req.body.price
            });
            return { success: r.ok, data: r, error: r.error || null };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async transferItem(req) {
        return this.giveItem(req);
    }

    async resetInventory(req) {
        try {
            await this.inventory.listInventory; // touch
            const { db } = require('../../../db/index.js');
            await db.pool.query(`DELETE FROM user_inventory WHERE guild_id = $1 AND user_id = $2`, [req.body.guildId, req.body.userId]);
            return { success: true };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async startDrop(req) {
        try {
            const drop = await this.inventory.startDrop({
                guildId: req.body.guildId,
                channelId: req.body.channelId,
                itemId: req.body.itemId,
                quantity: req.body.quantity || 1,
                durationMinutes: req.body.durationMinutes || 2
            });
            return { success: true, data: drop };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async claimDrop(req) {
        try {
            const r = await this.inventory.claimDrop(req.params.id, req.body.userId);
            return { success: r.ok, data: r, error: r.error || null };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async getHolders(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const data = await this.inventory.listHolders(guildId, req.params.itemId);
            return { success: true, data };
        } catch (err) { return { success: false, error: err.message }; }
    }

    async getTransfers(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const userId = req.query.user_id;
            const data = await this.inventory.listTransfers(guildId, userId);
            return { success: true, data };
        } catch (err) { return { success: false, error: err.message }; }
    }

    _config() {
        const { getConfig } = require('../../../config/index.js');
        return getConfig().features?.economy || {};
    }
}

Controller('/api/economy')(EconomyController);
Get('/balance/:userId')(EconomyController.prototype, 'getBalance');
Post('/daily')(EconomyController.prototype, 'claimDaily');
Post('/pay')(EconomyController.prototype, 'pay');
Get('/leaderboard')(EconomyController.prototype, 'leaderboard');
Get('/transactions/:userId')(EconomyController.prototype, 'transactions');
Post('/admin/add')(EconomyController.prototype, 'adminAdd');
Post('/admin/remove')(EconomyController.prototype, 'adminRemove');

Controller('/api/shop')(EconomyController);
Get('/')(EconomyController.prototype, 'listShop');
Post('/')(EconomyController.prototype, 'createShopItem');
Patch('/:id')(EconomyController.prototype, 'updateShopItem');
Delete('/:id')(EconomyController.prototype, 'deleteShopItem');

Controller('/api/inventory')(EconomyController);
Get('/:userId')(EconomyController.prototype, 'getInventory');
Post('/give')(EconomyController.prototype, 'giveItem');
Post('/sell')(EconomyController.prototype, 'sellItem');
Post('/transfer')(EconomyController.prototype, 'transferItem');
Post('/reset')(EconomyController.prototype, 'resetInventory');
Post('/drop')(EconomyController.prototype, 'startDrop');
Post('/drop/:id/claim')(EconomyController.prototype, 'claimDrop');
Get('/holders/:itemId')(EconomyController.prototype, 'getHolders');
Get('/transfers')(EconomyController.prototype, 'getTransfers');

module.exports = { EconomyController };
