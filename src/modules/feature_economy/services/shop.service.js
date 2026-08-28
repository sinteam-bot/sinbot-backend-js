/**
 * shop.service.js — boutique d'items
 *
 * - create({ guildId, name, description, emoji, price, roleRewardId, xpReward, maxPerUser })
 * - update / delete / get / list
 * - buy(guildId, userId, itemId) : débite l'économie, attribue l'item
 *   (et éventuellement le rôle / XP)
 *
 * La transaction de buy :
 *   1. getItem + check isTradeable, prix > 0
 *   2. economy.remove(user, price)
 *   3. inventory.add(item)
 *   4. si roleRewardId : member.roles.add (best-effort)
 *   5. si xpReward : addXP legacy
 *   6. log inventory_transfer type='shop'
 */

const { Injectable } = require('../../../core/index.js');
const { EconomyRepository } = require('./economy.repository.js');
const { EconomyService } = require('./economy.service.js');

class ShopService {
    static inject = [EconomyRepository, EconomyService];

    constructor(repo, economy) {
        this.repo = repo;
        this.economy = economy;
        this._client = null;
    }

    setClient(client) {
        this._client = client;
    }

    async create(item) {
        if (!item.guildId || !item.name || item.price === undefined) {
            return { ok: false, error: 'missing_params' };
        }
        if (item.price < 0) return { ok: false, error: 'invalid_price' };
        if (item.maxPerUser !== undefined && item.maxPerUser !== null && item.maxPerUser < 1) {
            return { ok: false, error: 'invalid_max' };
        }
        const created = await this.repo.insertItem(item);
        return { ok: true, data: created };
    }

    async update(id, fields) {
        return this.repo.updateItem(id, fields);
    }

    async delete(id) {
        return this.repo.deleteItem(id);
    }

    async get(id) {
        return this.repo.getItem(id);
    }

    async getByName(guildId, name) {
        return this.repo.getItemByName(guildId, name);
    }

    async list(guildId, limit, offset) {
        return this.repo.listItems(guildId, limit, offset);
    }

    async count(guildId) {
        return this.repo.countItems(guildId);
    }

    /**
     * Achat d'un item par un user.
     * @returns {Promise<{ok: boolean, error?: string, data?: any}>}
     */
    async buy(guildId, userId, itemId) {
        const item = await this.repo.getItem(itemId);
        if (!item) return { ok: false, error: 'item_not_found' };
        if (!item.isTradeable) return { ok: false, error: 'item_not_tradeable' };
        if (item.price > 0) {
            const r = await this.economy.remove(guildId, userId, item.price, { type: 'shop', reason: `buy:${item.name}` });
            if (!r.ok) return { ok: false, error: r.error };
        }

        // Ajout à l'inventaire
        const inv = await this.repo.addToInventory(guildId, userId, itemId, 1);

        // Récompenses annexes (best-effort)
        if (this._client) {
            try {
                const guild = await this._client.guilds.fetch(guildId);
                if (guild) {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (member) {
                        if (item.roleRewardId && !member.roles.cache.has(item.roleRewardId)) {
                            await member.roles.add(item.roleRewardId).catch(() => {});
                        }
                        if (item.xpReward && item.xpReward > 0) {
                            try {
                                const { addXP } = require('../../../database.js');
                                await addXP(userId, member.user.username, item.xpReward, 'event', `Achat ${item.name}`);
                            } catch {}
                        }
                    }
                }
            } catch {}
        }

        // Transfert d'inventaire type 'shop'
        await this.repo.insertTransfer({
            guildId,
            fromUserId: 'system',
            toUserId: userId,
            itemId,
            quantity: 1,
            type: 'shop',
            price: item.price
        });

        return { ok: true, data: { item, inventory: inv } };
    }
}

Injectable()(ShopService);

module.exports = { ShopService };
