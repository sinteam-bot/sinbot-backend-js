/**
 * economy.repository.js — couche d'accès BDD pour Économie & Inventaire
 *
 * Toutes les requêtes via db.pool.query (mock + PG prod).
 * Mapping row -> camelCase partout.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class EconomyRepository {
    // ============== USER ECONOMY ==============

    async getBalance(guildId, userId) {
        const res = await db.pool.query(
            `SELECT * FROM user_economy WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
            [guildId, userId]
        );
        return res.rows?.[0] ? this._mapBalance(res.rows[0]) : null;
    }

    async upsertBalance(guildId, userId, fields) {
        const existing = await this.getBalance(guildId, userId);
        const now = Date.now();
        if (existing) {
            const next = { ...existing, ...fields, updatedAt: now };
            await db.pool.query(
                `UPDATE user_economy SET balance = $1, bank_balance = $2, last_daily_claim_at = $3,
                 total_earned = $4, total_spent = $5, updated_at = $6
                 WHERE guild_id = $7 AND user_id = $8`,
                [next.balance, next.bankBalance, next.lastDailyClaimAt, next.totalEarned, next.totalSpent, now, guildId, userId]
            );
            return next;
        }
        const balance = fields.balance ?? 0;
        const bankBalance = fields.bankBalance ?? 0;
        const lastDaily = fields.lastDailyClaimAt ?? null;
        const totalEarned = fields.totalEarned ?? 0;
        const totalSpent = fields.totalSpent ?? 0;
        await db.pool.query(
            `INSERT INTO user_economy (user_id, guild_id, balance, bank_balance, last_daily_claim_at, total_earned, total_spent, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
            [userId, guildId, balance, bankBalance, lastDaily, totalEarned, totalSpent, now]
        );
        return this.getBalance(guildId, userId);
    }

    async leaderboard(guildId, limit = 50) {
        const res = await db.pool.query(
            `SELECT * FROM user_economy WHERE guild_id = $1 ORDER BY balance DESC LIMIT $2`,
            [guildId, limit]
        );
        return (res.rows || []).map(r => this._mapBalance(r));
    }

    // ============== TRANSACTIONS ==============

    async insertTransaction(t) {
        const id = t.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO economy_transactions
             (id, guild_id, user_id, amount, type, counterparty_id, reason, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, t.guildId, t.userId, t.amount, t.type, t.counterpartyId || null, t.reason || null, t.metadata ? JSON.stringify(t.metadata) : null, t.createdAt || now]
        );
        return { id, ...t };
    }

    async listTransactions(guildId, userId, limit = 50) {
        const res = await db.pool.query(
            `SELECT * FROM economy_transactions WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3`,
            [guildId, userId, limit]
        );
        return (res.rows || []).map(r => this._mapTransaction(r));
    }

    // ============== SHOP ITEMS ==============

    async insertItem(item) {
        const id = item.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO shop_items
             (id, guild_id, name, description, emoji, price, role_reward_id, xp_reward, is_tradeable, is_droppable, max_per_user, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
            [id, item.guildId, item.name, item.description || null, item.emoji || null,
             item.price, item.roleRewardId || null, item.xpReward || null,
             item.isTradeable === false ? 0 : 1, item.isDroppable === false ? 0 : 1,
             item.maxPerUser || null, now]
        );
        return this.getItem(id);
    }

    async getItem(id) {
        const res = await db.pool.query(`SELECT * FROM shop_items WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapItem(res.rows[0]) : null;
    }

    async updateItem(id, fields) {
        const allowed = ['name', 'description', 'emoji', 'price', 'role_reward_id', 'xp_reward', 'is_tradeable', 'is_droppable', 'max_per_user', 'updated_at'];
        const setSql = [];
        const params = [];
        for (const [k, v] of Object.entries(fields)) {
            const col = k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            if (allowed.includes(col)) {
                params.push(v);
                setSql.push(`${col} = $${params.length}`);
            }
        }
        if (setSql.length === 0) return;
        params.push(Date.now(), id);
        setSql.push(`updated_at = $${params.length - 1}`);
        await db.pool.query(
            `UPDATE shop_items SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
        return this.getItem(id);
    }

    async deleteItem(id) {
        await db.pool.query(`DELETE FROM shop_items WHERE id = $1`, [id]);
    }

    async listItems(guildId, limit = 100, offset = 0) {
        const res = await db.pool.query(
            `SELECT * FROM shop_items WHERE guild_id = $1 ORDER BY price ASC, created_at ASC LIMIT $2 OFFSET $3`,
            [guildId, limit, offset]
        );
        return (res.rows || []).map(r => this._mapItem(r));
    }

    async countItems(guildId) {
        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM shop_items WHERE guild_id = $1`,
            [guildId]
        );
        return res.rows?.[0]?.count || 0;
    }

    async getItemByName(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM shop_items WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
            [guildId, name]
        );
        return res.rows?.[0] ? this._mapItem(res.rows[0]) : null;
    }

    // ============== USER INVENTORY ==============

    async getInventoryEntry(guildId, userId, itemId) {
        const res = await db.pool.query(
            `SELECT * FROM user_inventory WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 LIMIT 1`,
            [guildId, userId, itemId]
        );
        return res.rows?.[0] ? this._mapInventory(res.rows[0]) : null;
    }

    async addToInventory(guildId, userId, itemId, quantity = 1) {
        const now = Date.now();
        const existing = await this.getInventoryEntry(guildId, userId, itemId);
        if (existing) {
            await db.pool.query(
                `UPDATE user_inventory SET quantity = quantity + $1, acquired_at = $2
                 WHERE guild_id = $3 AND user_id = $4 AND item_id = $5`,
                [quantity, now, guildId, userId, itemId]
            );
        } else {
            await db.pool.query(
                `INSERT INTO user_inventory (user_id, guild_id, item_id, quantity, acquired_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, guildId, itemId, quantity, now]
            );
        }
        return this.getInventoryEntry(guildId, userId, itemId);
    }

    async removeFromInventory(guildId, userId, itemId, quantity = 1) {
        const existing = await this.getInventoryEntry(guildId, userId, itemId);
        if (!existing) return { ok: false, reason: 'not_in_inventory' };
        if (existing.quantity < quantity) return { ok: false, reason: 'insufficient_quantity' };
        if (existing.quantity === quantity) {
            await db.pool.query(
                `DELETE FROM user_inventory WHERE guild_id = $1 AND user_id = $2 AND item_id = $3`,
                [guildId, userId, itemId]
            );
        } else {
            await db.pool.query(
                `UPDATE user_inventory SET quantity = quantity - $1 WHERE guild_id = $2 AND user_id = $3 AND item_id = $4`,
                [quantity, guildId, userId, itemId]
            );
        }
        return { ok: true };
    }

    async resetInventory(guildId, userId) {
        await db.pool.query(
            `DELETE FROM user_inventory WHERE guild_id = $1 AND user_id = $2`,
            [guildId, userId]
        );
    }

    async listInventory(guildId, userId) {
        const res = await db.pool.query(
            `SELECT ui.*, si.name AS item_name, si.emoji AS item_emoji, si.description AS item_description
             FROM user_inventory ui
             LEFT JOIN shop_items si ON si.id = ui.item_id
             WHERE ui.guild_id = $1 AND ui.user_id = $2
             ORDER BY ui.acquired_at DESC`,
            [guildId, userId]
        );
        return (res.rows || []).map(r => ({
            ...this._mapInventory(r),
            itemName: r.item_name,
            itemEmoji: r.item_emoji,
            itemDescription: r.item_description
        }));
    }

    async listHolders(guildId, itemId) {
        const res = await db.pool.query(
            `SELECT user_id, quantity FROM user_inventory WHERE guild_id = $1 AND item_id = $2 AND quantity > 0 ORDER BY quantity DESC`,
            [guildId, itemId]
        );
        return res.rows || [];
    }

    // ============== DROPS ==============

    async insertDrop(drop) {
        const id = drop.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO inventory_drops
             (id, guild_id, channel_id, message_id, item_id, quantity, started_at, expires_at, claimed_by, claimed_at, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, drop.guildId, drop.channelId, drop.messageId || null, drop.itemId, drop.quantity || 1,
             drop.startedAt || now, drop.expiresAt, drop.claimedBy || null, drop.claimedAt || null, drop.status || 'active']
        );
        return this.getDrop(id);
    }

    async updateDrop(id, fields) {
        const allowed = ['message_id', 'claimed_by', 'claimed_at', 'status'];
        const setSql = [];
        const params = [];
        for (const [k, v] of Object.entries(fields)) {
            const col = k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            if (allowed.includes(col)) {
                params.push(v);
                setSql.push(`${col} = $${params.length}`);
            }
        }
        if (setSql.length === 0) return;
        params.push(id);
        await db.pool.query(
            `UPDATE inventory_drops SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
    }

    async getDrop(id) {
        const res = await db.pool.query(`SELECT * FROM inventory_drops WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapDrop(res.rows[0]) : null;
    }

    async getDropByMessageId(messageId) {
        const res = await db.pool.query(
            `SELECT * FROM inventory_drops WHERE message_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
            [messageId]
        );
        return res.rows?.[0] ? this._mapDrop(res.rows[0]) : null;
    }

    async listActiveDrops(guildId, limit = 50) {
        const res = await db.pool.query(
            `SELECT * FROM inventory_drops WHERE guild_id = $1 AND status = 'active' ORDER BY expires_at ASC LIMIT $2`,
            [guildId, limit]
        );
        return (res.rows || []).map(r => this._mapDrop(r));
    }

    async listDueDrops(limit = 50) {
        const now = Date.now();
        const res = await db.pool.query(
            `SELECT * FROM inventory_drops WHERE status = 'active' AND expires_at <= $1 ORDER BY expires_at ASC LIMIT $2`,
            [now, limit]
        );
        return (res.rows || []).map(r => this._mapDrop(r));
    }

    // ============== TRANSFERS ==============

    async insertTransfer(t) {
        const id = t.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO inventory_transfers
             (id, guild_id, from_user_id, to_user_id, item_id, quantity, type, price, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, t.guildId, t.fromUserId, t.toUserId, t.itemId, t.quantity || 1, t.type,
             t.price || null, t.createdAt || now]
        );
        return { id, ...t };
    }

    async listTransfers(guildId, userId, limit = 50) {
        const where = ['guild_id = $1'];
        const args = [guildId];
        if (userId) {
            args.push(userId);
            where.push(`(from_user_id = $${args.length} OR to_user_id = $${args.length})`);
        }
        args.push(limit);
        const res = await db.pool.query(
            `SELECT * FROM inventory_transfers WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${args.length}`,
            args
        );
        return res.rows || [];
    }

    // ============== MAP ==============

    _mapBalance(row) {
        return {
            userId: row.user_id,
            guildId: row.guild_id,
            balance: Number(row.balance || 0),
            bankBalance: Number(row.bank_balance || 0),
            lastDailyClaimAt: row.last_daily_claim_at ? Number(row.last_daily_claim_at) : null,
            totalEarned: Number(row.total_earned || 0),
            totalSpent: Number(row.total_spent || 0),
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }

    _mapTransaction(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            amount: Number(row.amount || 0),
            type: row.type,
            counterpartyId: row.counterparty_id,
            reason: row.reason,
            metadata: row.metadata ? safeJson(row.metadata) : null,
            createdAt: Number(row.created_at || 0)
        };
    }

    _mapItem(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            name: row.name,
            description: row.description,
            emoji: row.emoji,
            price: Number(row.price || 0),
            roleRewardId: row.role_reward_id,
            xpReward: row.xp_reward ? Number(row.xp_reward) : null,
            isTradeable: !!row.is_tradeable,
            isDroppable: !!row.is_droppable,
            maxPerUser: row.max_per_user ? Number(row.max_per_user) : null,
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }

    _mapInventory(row) {
        return {
            userId: row.user_id,
            guildId: row.guild_id,
            itemId: row.item_id,
            quantity: Number(row.quantity || 1),
            acquiredAt: Number(row.acquired_at || 0)
        };
    }

    _mapDrop(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            messageId: row.message_id,
            itemId: row.item_id,
            quantity: Number(row.quantity || 1),
            startedAt: Number(row.started_at || 0),
            expiresAt: Number(row.expires_at || 0),
            claimedBy: row.claimed_by,
            claimedAt: row.claimed_at ? Number(row.claimed_at) : null,
            status: row.status
        };
    }
}

function safeJson(str) {
    try { return JSON.parse(str); } catch { return null; }
}

module.exports = { EconomyRepository };
