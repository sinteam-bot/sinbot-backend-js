/**
 * src/modules/community_ranks/services/ranks.service.js
 *
 * Service métier pour les rangs et rôles auto-rejoignables (Phase 10 G26).
 */

const { Injectable } = require('../../../core/index.js');
const { RanksRepository } = require('./ranks.repository.js');

class RanksService {
    static inject = [RanksRepository];

    constructor(repo) {
        this.repo = repo;
    }

    async createRank({ guildId, roleId, name, description }) {
        if (!guildId || !roleId || !name) {
            return { ok: false, error: 'Paramètres manquants (guildId, roleId, name)' };
        }

        const cleanName = name.trim().toLowerCase();
        const existing = await this.repo.getRankByName(guildId, cleanName);
        if (existing) {
            return { ok: false, error: `Un rang nommé "${cleanName}" existe déjà.` };
        }

        const created = await this.repo.createRank({
            guildId,
            roleId,
            name: cleanName,
            description
        });

        return { ok: true, data: created };
    }

    async joinRank(member, rankName) {
        if (!member || !member.guild || !rankName) {
            return { ok: false, error: 'Paramètres invalides' };
        }

        const rank = await this.repo.getRankByName(member.guild.id, rankName);
        if (!rank) {
            return { ok: false, error: `Le rang "${rankName}" n'existe pas.` };
        }

        if (member.roles.cache.has(rank.roleId)) {
            return { ok: false, error: `Tu possèdes déjà le rôle <@&${rank.roleId}>.` };
        }

        try {
            await member.roles.add(rank.roleId);
            return { ok: true, roleId: rank.roleId, rankName: rank.name };
        } catch (err) {
            return { ok: false, error: `Impossible d'ajouter le rôle : ${err.message}` };
        }
    }

    async leaveRank(member, rankName) {
        if (!member || !member.guild || !rankName) {
            return { ok: false, error: 'Paramètres invalides' };
        }

        const rank = await this.repo.getRankByName(member.guild.id, rankName);
        if (!rank) {
            return { ok: false, error: `Le rang "${rankName}" n'existe pas.` };
        }

        if (!member.roles.cache.has(rank.roleId)) {
            return { ok: false, error: `Tu ne possèdes pas le rôle <@&${rank.roleId}>.` };
        }

        try {
            await member.roles.remove(rank.roleId);
            return { ok: true, roleId: rank.roleId, rankName: rank.name };
        } catch (err) {
            return { ok: false, error: `Impossible de retirer le rôle : ${err.message}` };
        }
    }

    async listRanks(guildId) {
        return this.repo.listRanks(guildId);
    }

    async deleteRank(guildId, name) {
        const cleanName = (name || '').trim().toLowerCase();
        const existing = await this.repo.getRankByName(guildId, cleanName);
        if (!existing) {
            return { ok: false, error: `Rang "${cleanName}" introuvable.` };
        }
        await this.repo.deleteRank(guildId, cleanName);
        return { ok: true };
    }
}

Injectable()(RanksService);

module.exports = { RanksService };
