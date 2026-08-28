/**
 * economy.service.js — gestion de la monnaie virtuelle
 *
 * - getBalance(guildId, userId)
 * - add(guildId, userId, amount, { type, reason, counterpartyId })
 * - remove(guildId, userId, amount, { type, reason, counterpartyId })
 * - transfer(fromGuild, fromUser, toUser, amount, reason)
 * - claimDaily(guildId, userId)       : /daily avec cooldown
 * - leaderboard(guildId, limit)
 * - listTransactions(guildId, userId)
 *
 * Toutes les mutations sont des paires (balance, total_*) mises à jour
 * ensemble dans upsertBalance, et chaque mutation enregistre une
 * economy_transactions.
 */

const { Injectable } = require('../../../core/index.js');
const { EconomyRepository } = require('./economy.repository.js');

class EconomyService {
    static inject = [EconomyRepository];

    constructor(repo) {
        this.repo = repo;
    }

    async getBalance(guildId, userId) {
        return this.repo.getBalance(guildId, userId);
    }

    async getOrInitBalance(guildId, userId, startingBalance = 0) {
        const existing = await this.repo.getBalance(guildId, userId);
        if (existing) return existing;
        return this.repo.upsertBalance(guildId, userId, { balance: startingBalance });
    }

    async add(guildId, userId, amount, opts = {}) {
        if (amount <= 0) return { ok: false, error: 'invalid_amount' };
        const current = await this.getOrInitBalance(guildId, userId);
        const newBalance = current.balance + amount;
        const updated = await this.repo.upsertBalance(guildId, userId, {
            balance: newBalance,
            totalEarned: (current.totalEarned || 0) + amount
        });
        await this.repo.insertTransaction({
            guildId, userId, amount, type: opts.type || 'admin',
            counterpartyId: opts.counterpartyId,
            reason: opts.reason
        });
        return { ok: true, balance: newBalance, data: updated };
    }

    async remove(guildId, userId, amount, opts = {}) {
        if (amount <= 0) return { ok: false, error: 'invalid_amount' };
        const current = await this.getOrInitBalance(guildId, userId);
        if (current.balance < amount) return { ok: false, error: 'insufficient_balance' };
        const newBalance = current.balance - amount;
        const updated = await this.repo.upsertBalance(guildId, userId, {
            balance: newBalance,
            totalSpent: (current.totalSpent || 0) + amount
        });
        await this.repo.insertTransaction({
            guildId, userId, amount: -amount, type: opts.type || 'admin',
            counterpartyId: opts.counterpartyId,
            reason: opts.reason
        });
        return { ok: true, balance: newBalance, data: updated };
    }

    async transfer(fromGuildId, fromUserId, toUserId, amount, opts = {}) {
        if (amount <= 0) return { ok: false, error: 'invalid_amount' };
        const from = await this.getOrInitBalance(fromGuildId, fromUserId);
        if (from.balance < amount) return { ok: false, error: 'insufficient_balance' };
        const taxPercent = opts.taxPercent || 0;
        const tax = Math.floor((amount * taxPercent) / 100);
        const net = amount - tax;

        // Retire du sender
        await this.repo.upsertBalance(fromGuildId, fromUserId, {
            balance: from.balance - amount,
            totalSpent: (from.totalSpent || 0) + amount
        });
        // Ajoute au receiver
        const to = await this.getOrInitBalance(fromGuildId, toUserId);
        await this.repo.upsertBalance(fromGuildId, toUserId, {
            balance: to.balance + net,
            totalEarned: (to.totalEarned || 0) + net
        });
        // Log des deux côtés
        await this.repo.insertTransaction({
            guildId: fromGuildId, userId: fromUserId, amount: -amount,
            type: 'pay', counterpartyId: toUserId, reason: opts.reason
        });
        await this.repo.insertTransaction({
            guildId: fromGuildId, userId: toUserId, amount: net,
            type: 'pay', counterpartyId: fromUserId, reason: opts.reason
        });
        if (tax > 0) {
            // La taxe reste "détruite" (pas créditée à un user) pour l'instant
        }
        return { ok: true, net, tax };
    }

    /**
     * /daily : claim journalier
     */
    async claimDaily(guildId, userId, config) {
        const cooldownMs = (config.cooldown_hours || 22) * 3600 * 1000;
        const current = await this.getOrInitBalance(guildId, userId);
        if (current.lastDailyClaimAt && (Date.now() - current.lastDailyClaimAt) < cooldownMs) {
            const nextAt = current.lastDailyClaimAt + cooldownMs;
            return { ok: false, error: 'cooldown', nextAt };
        }
        const result = await this.add(guildId, userId, config.daily_reward || 100, {
            type: 'daily', reason: 'Daily reward'
        });
        if (!result.ok) return result;
        await this.repo.upsertBalance(guildId, userId, { lastDailyClaimAt: Date.now() });
        return { ok: true, balance: result.balance, reward: config.daily_reward || 100 };
    }

    async leaderboard(guildId, limit = 50) {
        return this.repo.leaderboard(guildId, limit);
    }

    async listTransactions(guildId, userId, limit = 50) {
        return this.repo.listTransactions(guildId, userId, limit);
    }
}

Injectable()(EconomyService);

module.exports = { EconomyService };
