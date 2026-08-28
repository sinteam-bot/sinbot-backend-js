/**
 * custom-command.service.js — gestion des commandes personnalisées
 *
 *   - create({ guildId, name, responseText, responseEmbed, restrictChannels, restrictRoles, cooldown, createdBy })
 *   - list(guildId)
 *   - find(guildId, name)
 *   - canRun(command, message, member) : check cooldowns + restrict
 *   - incrementCooldown(command)
 *   - delete(id)
 */

const { Injectable } = require('../../../core/index.js');
const { EngagementRepository } = require('./engagement.repository.js');

class CustomCommandService {
    static inject = [EngagementRepository];

    constructor(repo) {
        this.repo = repo;
        this._cooldowns = new Map(); // key: `g::name`, value: ts
    }

    async create({ guildId, name, responseText, responseEmbed, restrictChannels, restrictRoles, cooldown, createdBy }) {
        if (!guildId || !name) {
            return { ok: false, error: 'missing_params' };
        }
        if (!responseText && !responseEmbed) {
            return { ok: false, error: 'response_required' };
        }
        if (name.length < 1 || name.length > 32) {
            return { ok: false, error: 'invalid_name' };
        }
        const lc = name.toLowerCase();
        const existing = await this.repo.getCustomCommandByName(guildId, lc);
        if (existing) {
            return { ok: false, error: 'name_taken' };
        }
        const created = await this.repo.insertCustomCommand({
            guildId,
            name: lc,
            responseText: responseText?.slice(0, 500) || null,
            responseEmbedJson: responseEmbed ? JSON.stringify(responseEmbed) : null,
            restrictChannelIdsJson: restrictChannels?.length ? JSON.stringify(restrictChannels) : null,
            restrictRoleIdsJson: restrictRoles?.length ? JSON.stringify(restrictRoles) : null,
            cooldownSeconds: cooldown ?? 5,
            createdBy
        });
        // Reset le cooldown interne pour faciliter les tests en isolation
        this._cooldowns.delete(`${guildId}::${lc}`);
        return { ok: true, data: created };
    }

    async list(guildId) {
        return this.repo.listCustomCommands(guildId);
    }

    async get(id) { return this.repo.getCustomCommand(id); }

    async find(guildId, name) {
        return this.repo.getCustomCommandByName(guildId, name);
    }

    async delete(id) {
        await this.repo.deleteCustomCommand(id);
        return { ok: true };
    }

    /**
     * Check si la commande peut etre executee maintenant
     */
    canRun(command, message, member) {
        if (!command || !message) return { ok: false, reason: 'invalid' };

        // Cooldown
        const key = `${command.guildId}::${command.name}`;
        const last = this._cooldowns.get(key) || 0;
        if (Date.now() - last < (command.cooldownSeconds || 0) * 1000) {
            return { ok: false, reason: 'cooldown' };
        }

        // Channel restrict
        if (command.restrictChannelIds?.length && !command.restrictChannelIds.includes(message.channelId)) {
            return { ok: false, reason: 'channel_not_allowed' };
        }

        // Role restrict
        if (command.restrictRoleIds?.length && member) {
            const memberRoleIds = Array.from(member.roles?.cache?.keys() || []);
            const hasAllowed = command.restrictRoleIds.some(rid => memberRoleIds.includes(rid));
            if (!hasAllowed) return { ok: false, reason: 'role_required' };
        }

        return { ok: true };
    }

    incrementCooldown(command) {
        const key = `${command.guildId}::${command.name}`;
        this._cooldowns.set(key, Date.now());
    }

    async loadCache(guildId) {
        const list = await this.repo.listCustomCommands(guildId);
        this._cache = this._cache || new Map();
        this._cache.set(guildId, list);
        return list;
    }
}

Injectable()(CustomCommandService);

module.exports = { CustomCommandService };
