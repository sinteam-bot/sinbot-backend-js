/**
 * ticket-manager.service.js — orchestrateur des opérations Discord
 *
 * Crée les channels/threads, applique les permissions, met à jour
 * le DB. C'est la couche qui parle à discord.js ; le TicketService
 * ne fait que de la logique métier pure.
 */

const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');

class TicketManagerService {
    static inject = [TicketService, TicketPermissionsService, TranscriptService];

    constructor(ticketService, permissions, transcriptService) {
        this.ticketService = ticketService;
        this.permissions = permissions;
        this.transcriptService = transcriptService;
        if (this.transcriptService) this.transcriptService.setTicketService(this.ticketService);
    }

    /**
     * Crée un nouveau ticket (channel privé ou thread selon config)
     */
    async openTicket(guild, user, { category, subject, config, categoryConfig }) {
        const staffRoleIds = categoryConfig?.staff_roles || config?.allowed_roles || [];
        const useThreads = !!config?.use_threads;
        const baseName = `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32);

        let channel;
        if (useThreads) {
            const parent = await this._resolveParent(guild, config);
            if (!parent) {
                throw new Error('Salon parent introuvable pour la création de threads');
            }
            channel = await parent.threads.create({
                name: baseName,
                type: ChannelType.PrivateThread,
                reason: `Ticket ouvert par ${user.tag} (${user.id})`
            });
        } else {
            const overwrites = this.permissions.buildOverwrites(guild, user, staffRoleIds);
            channel = await guild.channels.create({
                name: baseName,
                type: ChannelType.GuildText,
                parent: await this._resolveCategory(guild, categoryConfig),
                permissionOverwrites: overwrites,
                topic: `Ticket de ${user.tag} (${user.id}) — ${subject || category}`,
                reason: `Ticket ouvert par ${user.tag} (${user.id})`
            });
        }

        const ticket = await this.ticketService.create({
            guildId: guild.id,
            channelId: channel.id,
            userId: user.id,
            category: category || 'support',
            subject: subject || null
        });

        const embed = new EmbedBuilder()
            .setColor(categoryConfig?.color || '#5865F2')
            .setTitle(`🎫 Ticket #${ticket.id.slice(0, 8)}`)
            .setDescription(
                `Bienvenue <@${user.id}> !\n\n` +
                `**Sujet :** ${subject || '—'}\n` +
                `**Catégorie :** ${categoryConfig?.label || category}\n\n` +
                `Un membre du staff va te répondre bientôt.`
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket:close')
                .setLabel('Fermer')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒'),
            new ButtonBuilder()
                .setCustomId('ticket:claim')
                .setLabel('Claim')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🙋')
        );

        await channel.send({ embeds: [embed], components: [row] });

        if (config?.settings?.ping_staff_on_open && config?.settings?.staff_role_to_ping) {
            try {
                await channel.send({ content: `<@&${config.settings.staff_role_to_ping}>`, allowedMentions: { roles: [config.settings.staff_role_to_ping] } });
            } catch {}
        }

        return { ticket, channel };
    }

    async _resolveParent(guild, config) {
        const id = config?.panel?.channel_id;
        if (!id) return null;
        return await guild.channels.fetch(id).catch(() => null);
    }

    async _resolveCategory(guild, categoryConfig) {
        if (!categoryConfig?.category_id) return null;
        return await guild.channels.fetch(categoryConfig.category_id).catch(() => null);
    }

    /**
     * Envoie le panel de création dans le salon configuré
     */
    async sendPanel(guild, config) {
        const channelId = config?.panel?.channel_id;
        if (!channelId) return null;
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return null;

        const embed = new EmbedBuilder()
            .setColor(config.panel.color || '#5865F2')
            .setTitle(config.panel.title || '📩 Support')
            .setDescription(config.panel.description || 'Clique sur le bouton ci-dessous pour ouvrir un ticket.')
            .setTimestamp();

        if (config.panel.image) embed.setImage(config.panel.image);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket:open-modal')
                .setLabel(config.panel.button_label || 'Ouvrir un ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(config.panel.button_emoji || '📩')
        );

        return await channel.send({ embeds: [embed], components: [row] });
    }

    /**
     * Construit un Modal Discord à partir de la config
     */
    buildModal(config, categoryChoices = null) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('ticket:modal:create')
            .setTitle('Ouvrir un ticket');

        const fields = config?.modal_fields || [];
        let i = 0;
        for (const f of fields) {
            const style = f.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short;
            const input = new TextInputBuilder()
                .setCustomId(f.id)
                .setLabel(f.label)
                .setStyle(style)
                .setRequired(!!f.required);
            if (f.min_length) input.setMinLength(f.min_length);
            if (f.max_length) input.setMaxLength(f.max_length);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            i++;
            if (i >= 5) break;
        }
        return modal;
    }

    /**
     * Renomme un channel ticket
     */
    async rename(channel, newName) {
        const safe = String(newName).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32);
        await channel.setName(safe || 'ticket');
    }
}

module.exports = { TicketManagerService };

Injectable()(TicketManagerService);
