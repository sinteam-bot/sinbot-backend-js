/**
 * CardEventListeners — déclenche le rendu de cartes sur
 * guildMemberAdd / guildMemberRemove / level-up (via hook)
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { WelcomeCardService } = require('../services/welcome-card.service.js');
const { getConfig } = require('../../../config/index.js');

class CardEventListeners {
    static inject = [WelcomeCardService];

    constructor(welcomeCard) {
        this.welcomeCard = welcomeCard;
    }

    async _getCardConfig(guildId) {
        const state = await featureRegistry.get(guildId, 'welcome');
        if (state.enabled) return { config: state.config, feature: 'welcome' };

        const cfg = getConfig();
        const welcome = cfg.welcome || {};
        return {
            config: {
                enabled: welcome.enabled !== false,
                template: welcome.card?.template || 'welcome',
                channel_id: welcome.channel_id,
                auto_roles: welcome.AUTO_ROLES || [],
                milestones: welcome.milestones || { enabled: false, thresholds: [] }
            },
            feature: 'welcome'
        };
    }

    async _sendCard(guild, channel, svg, filename, fallbackContent) {
        try {
            const { AttachmentBuilder } = require('discord.js');
            const attachment = new AttachmentBuilder(Buffer.from(svg, 'utf-8'), { name: filename });
            await channel.send({ content: fallbackContent, files: [attachment] });
        } catch (err) {
            console.error(`[CardEventListeners] send failed: ${err.message}`);
        }
    }

    async onMemberAdd(member) {
        if (member.user?.bot) return;
        const { config } = await this._getCardConfig(member.guild.id);
        if (!config.enabled) return;
        if (!config.channel_id) return;

        const channel = await member.guild.channels.fetch(config.channel_id).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const avatarUrl = member.user.displayAvatarURL
            ? member.user.displayAvatarURL({ extension: 'png', size: 256 })
            : null;

        const memberCount = member.guild.memberCount;

        try {
            const svg = await this.welcomeCard.render({
                guildId: member.guild.id,
                userId: member.id,
                template: 'welcome',
                payload: {
                    username: member.user.username,
                    server: member.guild.name,
                    memberCount,
                    avatarUrl
                }
            });
            await this._sendCard(member.guild, channel, svg, `welcome-${member.id}.svg`, `Bienvenue <@${member.id}> !`);

            for (const roleId of (config.auto_roles || [])) {
                try {
                    await member.roles.add(roleId);
                } catch (err) {
                    console.warn(`[CardEventListeners] auto_role ${roleId} failed: ${err.message}`);
                }
            }
        } catch (err) {
            console.error(`[CardEventListeners] welcome failed: ${err.message}`);
        }
    }

    async onMemberRemove(member) {
        if (member.user?.bot) return;
        const { config } = await this._getCardConfig(member.guild.id);
        if (!config.enabled) return;
        if (!config.channel_id) return;

        const channel = await member.guild.channels.fetch(config.channel_id).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const avatarUrl = member.user.displayAvatarURL
            ? member.user.displayAvatarURL({ extension: 'png', size: 256 })
            : null;

        let stayDuration = '';
        if (member.joinedAt) {
            const days = Math.floor((Date.now() - member.joinedAt.getTime()) / 86400000);
            stayDuration = days > 0 ? `${days} jour(s)` : 'aujourd\'hui';
        }

        try {
            const svg = await this.welcomeCard.render({
                guildId: member.guild.id,
                userId: member.id,
                template: 'leave',
                payload: {
                    username: member.user.username,
                    stayDuration,
                    avatarUrl
                }
            });
            await this._sendCard(member.guild, channel, svg, `leave-${member.id}.svg`, `${member.user.tag} a quitté le serveur.`);
        } catch (err) {
            console.error(`[CardEventListeners] leave failed: ${err.message}`);
        }
    }

    /**
     * Hook public appelé par LevelUpService (Phase 2) pour générer
     * la carte level-up réutilisable.
     */
    async renderLevelUp(guild, user, { level, totalXp, progressPercent }) {
        const avatarUrl = user.displayAvatarURL
            ? user.displayAvatarURL({ extension: 'png', size: 256 })
            : null;
        return this.welcomeCard.render({
            guildId: guild.id,
            userId: user.id,
            template: 'level_up',
            payload: {
                username: user.username,
                level,
                totalXp,
                progressPercent: progressPercent || 0,
                avatarUrl
            }
        });
    }

    async renderGiveaway({ guildId, userId, prize, host, winnersCount, endsAt, description }) {
        return this.welcomeCard.render({
            guildId,
            userId,
            template: 'giveaway',
            payload: { prize, host, winnersCount, endsAt, description }
        });
    }
}

OnEvent('guildMemberAdd', { configKey: 'features.welcome', priority: 10 })(CardEventListeners.prototype, 'onMemberAdd');
OnEvent('guildMemberRemove', { configKey: 'features.welcome', priority: 10 })(CardEventListeners.prototype, 'onMemberRemove');

module.exports = { CardEventListeners };
