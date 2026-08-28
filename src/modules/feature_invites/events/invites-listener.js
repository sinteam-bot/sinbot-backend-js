/**
 * feature_invites/events/invites-listener.js
 *
 * Listener des événements Discord pour le feature Invites :
 *  - ready : rafraîchit le cache d'invites pour chaque guilde
 *  - inviteCreate / inviteDelete : maintient le cache
 *  - guildMemberAdd : détecte l'inviteur, log, blacklist check
 *  - guildMemberRemove : marque le leave, log
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { getConfig } = require('../../../config/index.js');
const { InvitesService } = require('../services/invites.service.js');

class InvitesListener {
    static inject = [InvitesService];

    constructor(service) {
        this.service = service;
        this._client = null;
        this._memberCounter = new Map();
    }

    setClient(client) { this._client = client; }

    async onReady(client) {
        this._client = client;
        for (const [, guild] of client.guilds.cache) {
            try {
                await this.service.refreshInviteCache(guild);
            } catch (e) {
                console.warn(`[InvitesListener] refresh ${guild.id}:`, e.message);
            }
        }
        console.log('🎟️ [InvitesListener] Cache d\'invites initialisé pour ' +
            `${client.guilds.cache.size} guilde(s).`);
    }

    async onInviteCreate(invite) {
        try {
            await this.service.onInviteCreate(invite.guild, invite);
        } catch (e) {
            console.warn('[InvitesListener] inviteCreate:', e.message);
        }
    }

    async onInviteDelete(invite) {
        try {
            await this.service.onInviteDelete(invite.guild, invite.code);
        } catch (e) {
            console.warn('[InvitesListener] inviteDelete:', e.message);
        }
    }

    async onMemberAdd(member) {
        const config = await this.service._getConfig(member.guild.id);
        if (!config) return;
        if (member.user.bot && !config.track_bots) return;

        const detection = await this.service.detectInviter(member.guild, member);
        if (detection.isBot) return;

        const fake = await this.service.detectFake(member, config);
        const useRow = await this.service.recordJoin(member.guild, member, {
            ...detection,
            ...fake
        });

        if (useRow && config.join_log_channel_id) {
            const channel = member.guild.channels.cache.get(config.join_log_channel_id);
            if (channel?.isTextBased?.()) {
                const count = (this._memberCounter.get(member.guild.id) || 0) + 1;
                this._memberCounter.set(member.guild.id, count);

                const memberNumber = member.guild.memberCount;
                const message = this.service.formatJoinMessage(config.join_message, {
                    member: `<@${member.id}>`,
                    inviter: detection.inviterId && detection.inviterId !== 'unknown'
                        ? `<@${detection.inviterId}>`
                        : (detection.inviterUsername || 'Inconnu'),
                    inviteUses: detection.inviteUses || 0,
                    memberNumber,
                    guild: member.guild.name
                });

                const embed = new EmbedBuilder()
                    .setColor(config.embed_color || '#2F3136')
                    .setDescription(message)
                    .setTimestamp();

                if (useRow.isFake === 1) {
                    embed.addFields({
                        name: '⚠️ Invite suspecte',
                        value: useRow.fakeReason || 'détectée'
                    });
                }

                if (config.show_account_age && member.user.createdTimestamp) {
                    const ageDays = Math.floor(
                        (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24)
                    );
                    embed.addFields({
                        name: '🗓️ Compte créé',
                        value: `il y a ${ageDays} jour${ageDays > 1 ? 's' : ''}`
                    });
                }

                embed.setFooter({ text: `ID: ${member.id}` });

                try {
                    await channel.send({ embeds: [embed] });
                } catch (e) {
                    console.warn(`[InvitesListener] send join log ${config.join_log_channel_id}:`, e.message);
                }
            }
        }
    }

    async onMemberRemove(member) {
        const config = await this.service._getConfig(member.guild.id);
        if (!config) return;
        if (member.user?.bot && !config.track_bots) return;

        const left = await this.service.recordLeave(member.guild, member.id);
        if (!left) return;

        if (!config.leave_log_channel_id) return;
        const channel = member.guild.channels.cache.get(config.leave_log_channel_id);
        if (!channel?.isTextBased?.()) return;

        let inviterMention = 'Inconnu';
        if (left.inviterId && left.inviterId !== 'unknown' && left.inviterId !== 'vanity') {
            inviterMention = `<@${left.inviterId}>`;
        } else if (left.inviterUsername) {
            inviterMention = left.inviterUsername;
        }

        const message = this.service.formatLeaveMessage(config.leave_message, {
            member: `<@${member.id}>`,
            inviter: inviterMention
        });

        const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: `ID: ${member.id}` });

        try {
            await channel.send({ embeds: [embed] });
        } catch (e) {
            console.warn(`[InvitesListener] send leave log:`, e.message);
        }
    }
}

module.exports = { InvitesListener };

OnEvent('clientReady')(InvitesListener.prototype, 'onReady');
OnEvent('inviteCreate')(InvitesListener.prototype, 'onInviteCreate');
OnEvent('inviteDelete')(InvitesListener.prototype, 'onInviteDelete');
OnEvent('guildMemberAdd')(InvitesListener.prototype, 'onMemberAdd');
OnEvent('guildMemberRemove')(InvitesListener.prototype, 'onMemberRemove');
