/**
 * src/modules/util_server_stats/services/server-stats.service.js
 *
 * Service pour la mise à jour des salons compteurs et des statroles (P5 - Statbot).
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { ServerStatsRepository } = require('./server-stats.repository.js');
const logger = require('../../../utils/logger.js');

const DEFAULT_FORMATS = {
    total_members: '👥 Membres : {count}',
    human_members: '👤 Humains : {count}',
    bot_members: '🤖 Bots : {count}',
    online_members: '🟢 En ligne : {count}',
    boost_count: '🚀 Boosts : {count}',
    role_members: '👑 Rôle : {count}',
    channel_count: '📁 Salons : {count}',
    role_count: '🎭 Rôles : {count}',
    clock: '🕒 {tz} : {time}'
};

class ServerStatsService {
    static inject = [ServerStatsRepository];

    constructor(repo) {
        this.repo = repo;
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

    _countOnline(guild) {
        if (guild.presences?.cache) {
            return guild.presences.cache.filter(p => p.status !== 'offline').size || 0;
        }
        if (guild.members?.cache) {
            let online = 0;
            for (const m of guild.members.cache.values()) {
                if (m.presence && m.presence.status !== 'offline') online++;
            }
            return online > 0 ? online : Math.round((guild.memberCount || 1) * 0.35); // fallback approximation
        }
        return 0;
    }

    _countRoleMembers(guild, roleId) {
        if (!guild || !roleId) return 0;
        const role = guild.roles?.cache?.get(roleId);
        if (!role) return 0;
        return role.members?.size || 0;
    }

    _formatClock(timezone = 'UTC') {
        try {
            const date = new Date();
            const timeStr = date.toLocaleTimeString('fr-FR', {
                timeZone: timezone || 'UTC',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            return timeStr;
        } catch {
            return new Date().toISOString().slice(11, 16);
        }
    }

    computeStatCount(guild, statType, targetId = null) {
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
            case 'online_members':
                return this._countOnline(guild);
            case 'boost_count':
                return guild.premiumSubscriptionCount || 0;
            case 'role_members':
                return this._countRoleMembers(guild, targetId);
            case 'channel_count':
                return guild.channels?.cache?.size || 0;
            case 'role_count':
                return guild.roles?.cache?.size || 0;
            default:
                return total;
        }
    }

    formatChannelName(guild, statType, formatTemplate, targetId = null, timezone = null) {
        if (statType === 'clock') {
            const time = this._formatClock(timezone || 'UTC');
            const city = timezone ? timezone.split('/').pop().replace(/_/g, ' ') : 'UTC';
            const tmpl = formatTemplate || DEFAULT_FORMATS.clock;
            return tmpl.replace(/\{time\}/gi, time).replace(/\{tz\}/gi, city);
        }

        const count = this.computeStatCount(guild, statType, targetId);
        const tmpl = formatTemplate || DEFAULT_FORMATS[statType] || 'Membres : {count}';

        let roleName = 'Rôle';
        if (statType === 'role_members' && targetId && guild.roles?.cache) {
            const r = guild.roles.cache.get(targetId);
            if (r) roleName = r.name;
        }

        return tmpl.replace(/\{count\}/gi, String(count)).replace(/\{role\}/gi, roleName);
    }

    async registerChannel({ guildId, channelId, statType, format, targetId = null, timezone = null }) {
        const finalFormat = format || DEFAULT_FORMATS[statType] || 'Membres : {count}';
        return this.repo.registerChannel({
            guildId,
            channelId,
            statType,
            format: finalFormat,
            targetId,
            timezone
        });
    }

    async listChannels(guildId) {
        return this.repo.listChannels(guildId);
    }

    async deleteChannel(guildId, channelId) {
        return this.repo.deleteChannel(guildId, channelId);
    }

    /**
     * Configuration en 1 clic : Crée la catégorie et les 4 salons vocaux verrouillés de base
     */
    async setupDefaultCounters(guild) {
        if (!guild || !guild.channels?.create) {
            throw new Error('Guild invalide');
        }

        // 1. Créer la catégorie "📊 STATISTIQUES"
        const category = await guild.channels.create({
            name: '📊 STATISTIQUES',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: guild.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.Connect]
                }
            ]
        });

        const defaultTypes = [
            { type: 'total_members', format: '👥 Membres : {count}' },
            { type: 'human_members', format: '👤 Humains : {count}' },
            { type: 'bot_members', format: '🤖 Bots : {count}' },
            { type: 'boost_count', format: '🚀 Boosts : {count}' }
        ];

        const created = [];
        for (const item of defaultTypes) {
            const initialName = this.formatChannelName(guild, item.type, item.format);
            const chan = await guild.channels.create({
                name: initialName,
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: [PermissionFlagsBits.ViewChannel],
                        deny: [PermissionFlagsBits.Connect]
                    }
                ]
            });

            await this.registerChannel({
                guildId: guild.id,
                channelId: chan.id,
                statType: item.type,
                format: item.format
            });
            created.push({ channelId: chan.id, statType: item.type, name: initialName });
        }

        return { categoryId: category.id, channels: created };
    }

    async updateGuildStats(guild) {
        if (!guild) return;

        try {
            const channels = await this.repo.listChannels(guild.id);
            if (!channels || channels.length === 0) return;

            for (const cfg of channels) {
                const channel = guild.channels?.cache?.get(cfg.channelId) || await guild.channels?.fetch?.(cfg.channelId).catch(() => null);
                if (!channel) continue;

                const newName = this.formatChannelName(guild, cfg.statType, cfg.format, cfg.targetId, cfg.timezone);
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

    // =================== STATROLES ===================

    async addStatrole({ guildId, roleId, type, threshold }) {
        return this.repo.addStatrole({ guildId, roleId, type, threshold });
    }

    async listStatroles(guildId) {
        return this.repo.listStatroles(guildId);
    }

    async deleteStatrole(guildId, idOrRole) {
        return this.repo.deleteStatrole(guildId, idOrRole);
    }

    /**
     * Vérifie et attribue les statroles éligibles à un membre
     */
    async checkMemberStatroles(member, stats = {}) {
        if (!member || !member.guild) return [];
        const guildId = member.guild.id;
        const statroles = await this.repo.listStatroles(guildId);
        if (!statroles || statroles.length === 0) return [];

        const assigned = [];
        for (const sr of statroles) {
            const userValue = stats[sr.type] || 0;
            if (userValue >= sr.threshold) {
                if (member.roles && !member.roles.cache?.has(sr.roleId)) {
                    await member.roles.add(sr.roleId).catch(() => {});
                    assigned.push(sr.roleId);
                }
            }
        }
        return assigned;
    }
}

Injectable()(ServerStatsService);

module.exports = { ServerStatsService, DEFAULT_FORMATS };
