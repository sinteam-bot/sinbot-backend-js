/**
 * economy.service.js — gestion de la monnaie virtuelle & boosts (Phase 13 G11, G29)
 *
 * - getBalance(guildId, userId)
 * - add(guildId, userId, amount, { type, reason, counterpartyId })
 * - remove(guildId, userId, amount, { type, reason, counterpartyId })
 * - transfer(fromGuild, fromUser, toUser, amount, reason)
 * - claimDaily(guildId, userId, config) : /daily avec cooldown & boost
 * - claimWork(guildId, userId, config)  : /work avec cooldown & boost
 * - addBoost(guildId, userId, multiplier, durationSeconds)
 * - getActiveBoost(guildId, userId)
 * - getEconomyProfile(guildId, userId)
 * - leaderboard(guildId, limit)
 * - listTransactions(guildId, userId)
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
        return { ok: true, net, tax };
    }

    // ============== BOOSTS (G11) ==============

    async addBoost(guildId, userId, multiplier, durationSeconds) {
        if (multiplier <= 0 || durationSeconds <= 0) {
            return { ok: false, error: 'Multiplicateur et durée doivent être positifs.' };
        }
        const boost = await this.repo.addBoost({ guildId, userId, multiplier, durationSeconds });
        return { ok: true, data: boost };
    }

    async getActiveBoost(guildId, userId) {
        return this.repo.getActiveBoost(guildId, userId);
    }

    // ============== DAILY & WORK ==============

    async claimDaily(guildId, userId, config = {}) {
        const cooldownMs = (config.cooldown_hours || 22) * 3600 * 1000;
        const current = await this.getOrInitBalance(guildId, userId);
        if (current.lastDailyClaimAt && (Date.now() - current.lastDailyClaimAt) < cooldownMs) {
            const nextAt = current.lastDailyClaimAt + cooldownMs;
            return { ok: false, error: 'cooldown', nextAt };
        }

        const baseReward = config.daily_reward || 100;
        const activeBoost = await this.repo.getActiveBoost(guildId, userId);
        const multiplier = activeBoost ? activeBoost.multiplier : 1.0;
        const finalReward = Math.round(baseReward * multiplier);

        const result = await this.add(guildId, userId, finalReward, {
            type: 'daily',
            reason: activeBoost ? `Daily reward (Boost x${multiplier})` : 'Daily reward'
        });
        if (!result.ok) return result;

        await this.repo.upsertBalance(guildId, userId, { lastDailyClaimAt: Date.now() });
        return {
            ok: true,
            balance: result.balance,
            reward: finalReward,
            baseReward,
            multiplier,
            boostActive: Boolean(activeBoost)
        };
    }

    async claimWork(guildId, userId, config = {}) {
        const cooldownHours = config.work_cooldown_hours ?? 1;
        const cooldownMs = cooldownHours * 3600 * 1000;
        const current = await this.getOrInitBalance(guildId, userId);

        if (current.lastWorkClaimAt && (Date.now() - current.lastWorkClaimAt) < cooldownMs) {
            const nextAt = current.lastWorkClaimAt + cooldownMs;
            return { ok: false, error: 'cooldown', nextAt };
        }

        const minReward = Math.max(config.work_min_reward ?? 100, 1);
        const maxReward = Math.max(config.work_max_reward ?? 300, minReward);
        const baseReward = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;

        const activeBoost = await this.repo.getActiveBoost(guildId, userId);
        const multiplier = activeBoost ? activeBoost.multiplier : 1.0;
        const finalReward = Math.round(baseReward * multiplier);

        const jobs = [
            'Tu as développé une nouvelle fonctionnalité pour le bot',
            'Tu as préparé de délicieux cafés au café du coin',
            'Tu as livré des colis express à travers toute la ville',
            'Tu as animé un live stream communautaire interactif',
            'Tu as modéré le serveur Discord avec brio et diplomatie',
            'Tu as résolu une enquête mystérieuse avec perspicacité',
            'Tu as optimisé les bases de données et réparé les serveurs',
            'Tu as conçu un design graphique sensationnel pour la communauté',
            'Tu as donné des cours particuliers en informatique'
        ];
        const job = jobs[Math.floor(Math.random() * jobs.length)];

        const result = await this.add(guildId, userId, finalReward, {
            type: 'work',
            reason: activeBoost ? `Work: ${job} (Boost x${multiplier})` : `Work: ${job}`
        });
        if (!result.ok) return result;

        await this.repo.upsertBalance(guildId, userId, { lastWorkClaimAt: Date.now() });
        return {
            ok: true,
            balance: result.balance,
            reward: finalReward,
            baseReward,
            multiplier,
            boostActive: Boolean(activeBoost),
            job
        };
    }

    // ============== PROFILE INFO (G29) ==============

    async getEconomyProfile(guildId, userId) {
        const balance = await this.getOrInitBalance(guildId, userId);
        const activeBoost = await this.repo.getActiveBoost(guildId, userId);
        return {
            wallet: balance.balance,
            bank: balance.bankBalance,
            total: balance.balance + balance.bankBalance,
            totalEarned: balance.totalEarned || 0,
            totalSpent: balance.totalSpent || 0,
            lastDailyClaimAt: balance.lastDailyClaimAt,
            lastWorkClaimAt: balance.lastWorkClaimAt,
            activeBoost
        };
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
