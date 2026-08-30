/**
 * src/modules/community_tickets/commands/ticket-panel.cmd.js
 *
 * Commandes Slash /ticket-panel pour la gestion multi-panels (Module P4).
 */

const {
    SlashCommandBuilder, PermissionFlagsBits, ChannelType,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { Command } = require('../../../core/index.js');
const { TicketService } = require('../services/ticket.service.js');

class TicketPanelCommands {
    static inject = [TicketService];

    constructor(service) {
        this.service = service;
    }

    async executeCreate(interaction) {
        const name = interaction.options.getString('nom');
        const title = interaction.options.getString('titre');
        const description = interaction.options.getString('description');
        const category = interaction.options.getChannel('categorie');
        const buttonLabel = interaction.options.getString('bouton_label') || 'Ouvrir un ticket';
        const buttonEmoji = interaction.options.getString('bouton_emoji') || '📩';

        const panel = await this.service.createPanel({
            guildId: interaction.guild.id,
            name,
            title,
            description,
            categoryId: category?.id || null,
            buttonLabel,
            buttonEmoji
        });

        return interaction.reply({
            content: `✅ Panneau de ticket **"${panel.name}"** créé avec succès. Utilisez \`/ticket-panel send ${panel.name} #salon\` pour l’envoyer.`,
            ephemeral: true
        });
    }

    async executeSend(interaction) {
        const name = interaction.options.getString('nom');
        const channel = interaction.options.getChannel('salon');

        const panel = await this.service.getPanel(interaction.guild.id, name);
        if (!panel) {
            return interaction.reply({ content: `❌ Aucun panneau nommé "${name}".`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(panel.title)
            .setDescription(panel.description || 'Cliquez sur le bouton ci-dessous pour ouvrir un ticket auprès de l\'équipe.')
            .setFooter({ text: `Système de Support • ${interaction.guild.name}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket:open_panel:${panel.id}`)
                .setLabel(panel.buttonLabel)
                .setStyle(ButtonStyle.Primary)
                .setEmoji(panel.buttonEmoji)
        );

        await channel.send({ embeds: [embed], components: [row] });
        await this.service.createPanel({ ...panel, channelId: channel.id });

        return interaction.reply({ content: `✅ Panneau envoyé dans <#${channel.id}>.`, ephemeral: true });
    }

    async executeList(interaction) {
        const list = await this.service.listPanels(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun panneau de tickets configuré.', ephemeral: true });
        }

        const lines = list.map(p => `• \`${p.name}\` — **${p.title}** (Catégorie: ${p.categoryId ? `<#${p.categoryId}>` : 'Défaut'})`);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📑 Panneaux de tickets configurés (${list.length})`)
            .setDescription(lines.join('\n'));

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeDelete(interaction) {
        const name = interaction.options.getString('nom');
        await this.service.deletePanel(interaction.guild.id, name);
        return interaction.reply({ content: `✅ Panneau \`${name}\` supprimé.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'create': return this.executeCreate(interaction);
            case 'send':   return this.executeSend(interaction);
            case 'list':   return this.executeList(interaction);
            case 'delete': return this.executeDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const panelBuilder = new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Gestion des multi-panneaux de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('create')
            .setDescription('Créer un nouveau panneau de tickets')
            .addStringOption(o => o.setName('nom').setDescription('Nom d’identifiant unique (ex: recrutement)').setRequired(true))
            .addStringOption(o => o.setName('titre').setDescription('Titre affiché sur l’embed').setRequired(true))
            .addStringOption(o => o.setName('description').setDescription('Texte explicatif du panneau').setRequired(false))
            .addChannelOption(o => o.setName('categorie').setDescription('Catégorie où ouvrir les tickets').setRequired(false).addChannelTypes(ChannelType.GuildCategory))
            .addStringOption(o => o.setName('bouton_label').setDescription('Texte du bouton').setRequired(false))
            .addStringOption(o => o.setName('bouton_emoji').setDescription('Emoji du bouton').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('send')
            .setDescription('Envoyer un panneau dans un salon')
            .addStringOption(o => o.setName('nom').setDescription('Nom du panneau').setRequired(true))
            .addChannelOption(o => o.setName('salon').setDescription('Salon de destination').setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les panneaux de tickets')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un panneau')
            .addStringOption(o => o.setName('nom').setDescription('Nom du panneau à supprimer').setRequired(true))
    );

Command({ name: 'ticket-panel', builder: panelBuilder })(TicketPanelCommands.prototype, 'executeMain');

module.exports = { TicketPanelCommands };
