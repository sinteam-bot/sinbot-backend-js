/**
 * src/modules/util_server_stats/services/server-stats.service.js
 *
 * Service pour la mise à jour des salons compteurs de statistiques (Phase 9 G08).
 */

const { Injectable } = require('../../../core/index.js');
const { ServerStatsRepository } = require('./server-stats.repository.js');
const logger = require('../../../utils/logger.js');

const DEFAULT_FORMATS = {
    total_members: '👥 Membres : {count}',
    human_members: '👤 Humains : {count}',
    bot_members: '🤖 Bots : {count}',
    channel_count: '📁 Salons : {count}',
    role_count: '🎭 Rôles : {count}'
};

class ServerStatsService {
    static inject = [ServerStatsRepository];

    constructor(repo) {
        this.repo = repo;
        this._lastUpdates = new Map(); // key: channelId, value: timestamp
    }

    _countBots(guild) {
        if (!guild.members?.cache) return 0;
        if (typeof guild.members.cache.filter === 'function') {
            return guild.members.cache.filter(m => m.user?.bot).size || 0;
        }
        let count = 0;
        for (const m of guild.members.cache.values()) {
            if (m.user?.bot) count++;
        }
        return count;
    }

    computeStatCount(guild, statType) {
        if (!guild) return 0;
        const total = guild.memberCount || guild.members?.cache?.size || 0;
        
        switch (statType) {
            case 'total_members':
                return total;
            case 'human_members': {
                const bots = this._countBots(guild);
                return Math.max(0, total - bots);
            }
            case 'bot_members':
                return this._countBots(guild);
            case 'channel_count':
                return guild.channels?.cache?.size || 0;
            case 'role_count':
                return guild.roles?.cache?.size || 0;
            default:
                return total;
        }
    }

    formatChannelName(guild, statType, formatTemplate) {
        const count = this.computeStatCount(guild, statType);
        const tmpl = formatTemplate || DEFAULT_FORMATS[statType] || 'Membres : {count}';
        return tmpl.replace(/\{count\}/gi, String(count));
    }

    async registerChannel({ guildId, channelId, statType, format }) {
        const finalFormat = format || DEFAULT_FORMATS[statType] || 'Membres : {count}';
        return this.repo.registerChannel({
            guildId,
            channelId,
            statType,
            format: finalFormat
        });
    }

    async listChannels(guildId) {
        return this.repo.listChannels(guildId);
    }

    async deleteChannel(guildId, channelId) {
        return this.repo.deleteChannel(guildId, channelId);
    }

    async updateGuildStats(guild) {
        if (!guild) return;

        try {
            const channels = await this.repo.listChannels(guild.id);
            if (!channels || channels.length === 0) return;

            for (const cfg of channels) {
                const channel = guild.channels?.cache?.get(cfg.channelId) || await guild.channels?.fetch?.(cfg.channelId).catch(() => null);
                if (!channel) continue;

                const newName = this.formatChannelName(guild, cfg.statType, cfg.format);
                if (channel.name !== newName) {
                    await channel.setName(newName).catch(err => {
                        logger.warn(`Impossible de renommer le salon stats ${channel.id}: ${err.message}`, 'SERVER_STATS');
                    });
                }
            }
        } catch (err) {
            logger.warn(`Erreur updateGuildStats pour ${guild.id}: ${err.message}`, 'SERVER_STATS');
        }
    }
}

Injectable()(ServerStatsService);

module.exports = { ServerStatsService, DEFAULT_FORMATS };
