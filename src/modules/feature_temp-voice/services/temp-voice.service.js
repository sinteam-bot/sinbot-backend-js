/**
 * temp-voice.service.js — logique métier des vocaux temporaires
 *
 * API pure (sans discord.js) — testable en isolation.
 * Le listener est séparé et c'est lui qui appelle les méthodes
 * Discord.
 *
 *   - getConfig(guildId)             : retourne config ou défauts
 *   - setConfig(guildId, patch)       : upsert
 *   - isJoinChannel(channelId, cfg)   : true si channel dans join_channels
 *   - computeChannelName(user, cfg)   : formate le nom depuis template
 *   - canCreate(guildId, cfg)         : false si max_per_guild atteint
 *   - registerChannel(channelId, ...)  : enregistre dans temp_voice_state
 *   - markEmpty(channelId)             : marque last_empty_at
 *   - markActive(channelId)            : remet last_empty_at à 0
 *   - forgetChannel(channelId)         : supprime l'entry
 *   - listExpiringNow(guildId, delaySec) : canaux vides depuis > delaySec
 *   - computeSuffixName(name, count)   : ajoute 🎮 si >= 2 users
 */

const { Injectable } = require('../../../core/index.js');
const { TempVoiceRepository } = require('./temp-voice.repository.js');

class TempVoiceService {
    static inject = [TempVoiceRepository];

    constructor(repo) {
        this.repo = repo;
    }

    async getConfig(guildId) {
        const c = await this.repo.getConfig(guildId);
        if (c) return c;
        return {
            guildId,
            categoryId: null,
            format: "{user}'s game",
            deleteDelaySeconds: 5,
            maxPerGuild: 0,
            lockedRoleId: null,
            joinChannels: [],
            enabled: false,
            updatedAt: 0
        };
    }

    async setConfig(guildId, patch) {
        const current = await this.getConfig(guildId);
        const merged = { ...current, ...patch, guildId };
        return this.repo.upsertConfig({
            guildId,
            categoryId: merged.categoryId,
            format: merged.format,
            deleteDelaySeconds: merged.deleteDelaySeconds,
            maxPerGuild: merged.maxPerGuild,
            lockedRoleId: merged.lockedRoleId,
            joinChannels: merged.joinChannels,
            enabled: merged.enabled
        });
    }

    isJoinChannel(channelId, config) {
        if (!config || !config.joinChannels) return false;
        return config.joinChannels.includes(channelId);
    }

    isEnabled(config) {
        return !!(config && config.enabled);
    }

    computeChannelName(user, config) {
        const fmt = (config && config.format) || "{user}'s game";
        const display = user.globalName || user.username || 'User';
        return fmt
            .replace(/{user}/g, display)
            .replace(/{username}/g, user.username || display)
            .slice(0, 100);
    }

    computeSuffixName(name, userCount) {
        if (userCount >= 2) {
            return `${name} 🎮`;
        }
        return name;
    }

    async canCreate(guildId, config) {
        const max = config?.maxPerGuild || 0;
        if (max <= 0) return true;
        const count = await this.repo.countByGuild(guildId);
        return count < max;
    }

    async registerChannel(channelId, guildId, creatorId) {
        await this.repo.insertState({ channelId, guildId, creatorId, lastEmptyAt: 0 });
    }

    async markEmpty(channelId) {
        await this.repo.insertState({
            channelId,
            guildId: (await this.repo.getState(channelId))?.guildId || '',
            creatorId: null,
            lastEmptyAt: Date.now()
        });
    }

    async markActive(channelId) {
        await this.repo.insertState({
            channelId,
            guildId: (await this.repo.getState(channelId))?.guildId || '',
            creatorId: null,
            lastEmptyAt: 0
        });
    }

    async forgetChannel(channelId) {
        await this.repo.deleteState(channelId);
    }

    async getState(channelId) {
        return this.repo.getState(channelId);
    }

    async listActive(guildId) {
        return this.repo.listActiveStates(guildId);
    }

    async listExpiringNow(guildId, delaySeconds) {
        const before = Date.now() - (delaySeconds * 1000);
        return this.repo.listStatesEmptySince(guildId, before);
    }
}

Injectable()(TempVoiceService);

module.exports = { TempVoiceService };
