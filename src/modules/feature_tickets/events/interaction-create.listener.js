/**
 * Listener pour les interactions liées aux tickets
 * - Boutons du panel : ticket:open-modal, ticket:close, ticket:claim
 * - Modal de création : ticket:modal:create
 * - Slash commands de tickets (gérés via Command() decorator)
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { TicketService } = require('../services/ticket.service.js');
const { TicketManagerService } = require('../services/ticket-manager.service.js');
const { TicketPermissionsService } = require('../services/ticket-permissions.service.js');
const { getConfig } = require('../../../config/index.js');

class TicketInteractionListener {
    static inject = [TicketService, TicketManagerService, TicketPermissionsService];

    constructor(ticketService, manager, permissions) {
        this.ticketService = ticketService;
        this.manager = manager;
        this.permissions = permissions;
    }

    async handle(interaction) {
        if (!interaction.guild) return;
        const state = await featureRegistry.get(interaction.guild.id, 'tickets');
        if (!state.enabled) return;

        const config = this._getConfig();

        try {
            if (interaction.isButton()) {
                await this._handleButton(interaction, config);
            } else if (interaction.isModalSubmit()) {
                await this._handleModal(interaction, config);
            } else if (interaction.isChatInputCommand?.() || interaction.type === 2) {
                await this._handleCommand(interaction, config);
            }
        } catch (err) {
            console.error(`[TicketInteractionListener] error: ${err.message}`);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: `❌ Erreur: ${err.message}`, ephemeral: true });
                }
            } catch (e) {
                console.warn('[TicketInteractionListener] Impossible d\'envoyer le message d\'erreur éphémère:', e.message);
            }
        }
    }

    _getConfig() {
        const cfg = getConfig();
        return cfg.features?.tickets || cfg.tickets || {};
    }

    async _handleButton(interaction, config) {
        const customId = interaction.customId;

        if (customId === 'ticket:open-modal') {
            const modal = this.manager.buildModal(config);
            return interaction.showModal(modal);
        }

        if (customId === 'ticket:close') {
            return this._handleCloseButton(interaction, config);
        }

        if (customId === 'ticket:claim') {
            return this._handleClaimButton(interaction, config);
        }
    }

    async _handleModal(interaction, config) {
        if (interaction.customId !== 'ticket:modal:create') return;
        await interaction.deferReply({ ephemeral: true });

        const subject = interaction.fields.getTextInputValue('subject') || 'Sans sujet';
        const description = interaction.fields.getTextInputValue('description') || '';

        const guild = interaction.guild;
        const user = interaction.user;

        const openCount = await this.ticketService.countOpenByUser(guild.id, user.id);
        const maxOpen = config?.settings?.max_open_per_user ?? 3;
        if (openCount >= maxOpen) {
            return interaction.editReply({ content: `❌ Tu as déjà ${openCount} ticket(s) ouvert(s). Maximum: ${maxOpen}.` });
        }

        const category = config?.categories?.[0]?.id || 'support';
        const categoryConfig = config?.categories?.find(c => c.id === category) || config?.categories?.[0] || {};

        const { ticket, channel } = await this.manager.openTicket(guild, user, {
            category,
            subject: `${subject} — ${description.slice(0, 80)}`,
            config,
            categoryConfig
        });

        return interaction.editReply({ content: `✅ Ticket créé : <#${channel.id}>` });
    }

    async _handleCloseButton(interaction, config) {
        const ticket = await this.ticketService.getByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });

        const member = interaction.member;
        const staffRoleIds = config?.allowed_roles || [];
        if (!this.permissions.isOwnerOrStaff(member, ticket.userId, staffRoleIds)) {
            return interaction.reply({ content: '❌ Seul le créateur ou un membre du staff peut fermer.', ephemeral: true });
        }

        await this._closeTicketFlow(interaction.guild, interaction.channel, ticket, interaction.user, config);
        return interaction.reply({ content: '🔒 Ticket fermé.' });
    }

    async _handleClaimButton(interaction, config) {
        const ticket = await this.ticketService.getByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });

        const member = interaction.member;
        const staffRoleIds = config?.allowed_roles || [];
        if (!this.permissions.isStaff(member, staffRoleIds)) {
            return interaction.reply({ content: '❌ Réservé au staff.', ephemeral: true });
        }

        const updated = await this.ticketService.claim(ticket.id, interaction.user.id);
        await interaction.reply({ content: `✅ Ticket claim par <@${interaction.user.id}> (statut: ${updated.status}).` });
    }

    async _handleCommand(interaction, config) {
        const cmd = interaction.commandName;
        if (!cmd?.startsWith('ticket-')) return;
        const action = cmd.replace('ticket-', '');
        const ticket = await this.ticketService.getByChannel(interaction.channelId);
        if (!ticket) {
            return interaction.reply({ content: '❌ Cette commande doit être exécutée dans un ticket.', ephemeral: true });
        }

        const member = interaction.member;
        const staffRoleIds = config?.allowed_roles || [];

        switch (action) {
            case 'close':
                if (!this.permissions.isOwnerOrStaff(member, ticket.userId, staffRoleIds))
                    return interaction.reply({ content: '❌ Permissions insuffisantes', ephemeral: true });
                await this._closeTicketFlow(interaction.guild, interaction.channel, ticket, interaction.user, config);
                return interaction.reply({ content: '🔒 Ticket fermé.' });

            case 'claim':
                if (!this.permissions.isStaff(member, staffRoleIds))
                    return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
                await this.ticketService.claim(ticket.id, interaction.user.id);
                return interaction.reply({ content: `✅ Ticket claim.` });

            case 'unclaim':
                if (!this.permissions.isStaff(member, staffRoleIds))
                    return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
                await this.ticketService.unclaim(ticket.id);
                return interaction.reply({ content: `✅ Ticket lâché.` });

            case 'add': {
                if (!this.permissions.isStaff(member, staffRoleIds))
                    return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
                const u = interaction.options.getUser('user');
                await interaction.channel.permissionOverwrites.edit(u.id, {
                    ViewChannel: true, SendMessages: true, ReadMessageHistory: true
                });
                return interaction.reply({ content: `✅ ${u.tag} ajouté au ticket.` });
            }

            case 'remove': {
                if (!this.permissions.isStaff(member, staffRoleIds))
                    return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
                const u = interaction.options.getUser('user');
                await interaction.channel.permissionOverwrites.delete(u.id).catch(err => {
                    console.warn('[TicketInteractionListener] Erreur suppression overwrite:', err.message);
                });
                return interaction.reply({ content: `✅ ${u.tag} retiré du ticket.` });
            }

            case 'rename': {
                if (!this.permissions.isStaff(member, staffRoleIds))
                    return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
                const newName = interaction.options.getString('name');
                await this.manager.rename(interaction.channel, newName);
                return interaction.reply({ content: `✅ Ticket renommé.` });
            }

            case 'transcript': {
                if (!this.permissions.isStaff(member, staffRoleIds))
                    return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
                const html = await this.manager.transcriptService?.generateHTML?.(ticket.id);
                if (!html) return interaction.reply({ content: '❌ Transcript indisponible', ephemeral: true });
                const { AttachmentBuilder } = require('discord.js');
                const attachment = new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: `transcript-${ticket.id.slice(0, 8)}.html` });
                return interaction.reply({ files: [attachment] });
            }

            case 'reopen': {
                if (!this.permissions.isStaff(member, staffRoleIds))
                    return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
                await this.ticketService.reopen(ticket.id);
                return interaction.reply({ content: `✅ Ticket rouvert.` });
            }
        }
    }

    async _closeTicketFlow(guild, channel, ticket, closer, config) {
        await this.ticketService.close(ticket.id, closer.id);
        try {
            const transcriptChannelId = config?.settings?.transcript_channel_id;
            if (transcriptChannelId && this.manager.transcriptService) {
                await this.manager.transcriptService.publishToTranscriptChannel(guild, ticket.id, transcriptChannelId);
            }
        } catch (err) {
            console.error(`[TicketInteractionListener] transcript publish failed: ${err.message}`);
        }

        if (config?.settings?.auto_close_after_days) {
            setTimeout(async () => {
                try { await channel.delete('Auto-close ticket'); } catch (err) { console.warn('[TicketInteractionListener] Impossible de supprimer le salon ticket:', err.message); }
                await this.ticketService.deleteByChannelId(channel.id);
            }, 5_000);
        } else {
            setTimeout(async () => {
                try { await channel.delete('Ticket fermé'); } catch (err) { console.warn('[TicketInteractionListener] Impossible de supprimer le salon ticket:', err.message); }
                await this.ticketService.deleteByChannelId(channel.id);
            }, 5_000);
        }
    }
}

OnEvent('interactionCreate', {
    configKey: 'features.tickets',
    priority: 80
})(TicketInteractionListener.prototype, 'handle');

module.exports = { TicketInteractionListener };
