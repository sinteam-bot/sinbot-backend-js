/**
 * src/modules/util_embed_builder/commands/embed-builder.cmd.js
 *
 * Commandes Slash pour le Message Embedder (Phase 12 G40).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { EmbedBuilderService } = require('../services/embed-builder.service.js');

class EmbedBuilderCommands {
    static inject = [EmbedBuilderService];

    constructor(service) {
        this.service = service;
    }

    async executePost(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs (ManageMessages).', ephemeral: true });
        }

        const channel = interaction.options.getChannel('salon');
        const title = interaction.options.getString('titre');
        const description = interaction.options.getString('description');
        const color = interaction.options.getString('couleur') || '#5865F2';
        const image = interaction.options.getString('image');
        const footer = interaction.options.getString('footer');

        const res = await this.service.postEmbed({
            guildId: interaction.guild.id,
            channelId: channel.id,
            embedData: {
                title,
                description,
                color,
                image,
                footer
            },
            client: interaction.client
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ Erreur : ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Embed posté avec succès dans <#${channel.id}> (ID: \`${res.data.id}\`).`,
            ephemeral: true
        });
    }

    async executeEdit(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs (ManageMessages).', ephemeral: true });
        }

        const id = interaction.options.getString('id');
        const title = interaction.options.getString('titre');
        const description = interaction.options.getString('description');
        const color = interaction.options.getString('couleur');
        const image = interaction.options.getString('image');

        const embedData = {};
        if (title !== null) embedData.title = title;
        if (description !== null) embedData.description = description;
        if (color !== null) embedData.color = color;
        if (image !== null) embedData.image = image;

        const res = await this.service.editEmbed({
            id,
            embedData,
            client: interaction.client
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ Erreur : ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Embed \`${id}\` modifié et actualisé en direct sur Discord.`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const list = await this.service.listEmbeds(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun embed persistant sur ce serveur.', ephemeral: true });
        }

        const lines = list.map(e => `• \`${e.id}\` dans <#${e.channelId}> — **${e.title || 'Sans titre'}**`);

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📜 Embeds persistants (${list.length})`)
            .setDescription(lines.slice(0, 30).join('\n'))
            .setFooter({ text: 'Utilisation : /embed-edit <id> ou /embed-delete <id>' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeDelete(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs (ManageMessages).', ephemeral: true });
        }

        const id = interaction.options.getString('id');
        const deleteMsg = interaction.options.getBoolean('supprimer_message_discord') ?? true;

        const res = await this.service.deleteEmbed({
            id,
            deleteDiscordMessage: deleteMsg,
            client: interaction.client
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ Erreur : ${res.error}`, ephemeral: true });
        }

        return interaction.reply({ content: `✅ Embed \`${id}\` supprimé.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'post':   return this.executePost(interaction);
            case 'edit':   return this.executeEdit(interaction);
            case 'list':   return this.executeList(interaction);
            case 'delete': return this.executeDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const embedBuilder = new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Créer et modifier des embeds persistants dans les salons')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
        sub.setName('post')
            .setDescription('Poster un nouvel embed dans un salon')
            .addChannelOption(o => o.setName('salon').setDescription('Salon cible').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
            .addStringOption(o => o.setName('titre').setDescription('Titre de l’embed').setRequired(true))
            .addStringOption(o => o.setName('description').setDescription('Description de l’embed').setRequired(true))
            .addStringOption(o => o.setName('couleur').setDescription('Couleur Hex (ex: #5865F2)').setRequired(false))
            .addStringOption(o => o.setName('image').setDescription('URL de l’image principale').setRequired(false))
            .addStringOption(o => o.setName('footer').setDescription('Texte du footer').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('edit')
            .setDescription('Modifier un embed existant')
            .addStringOption(o => o.setName('id').setDescription('ID de l’embed à modifier').setRequired(true))
            .addStringOption(o => o.setName('titre').setDescription('Nouveau titre').setRequired(false))
            .addStringOption(o => o.setName('description').setDescription('Nouvelle description').setRequired(false))
            .addStringOption(o => o.setName('couleur').setDescription('Nouvelle couleur').setRequired(false))
            .addStringOption(o => o.setName('image').setDescription('Nouvelle image').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les embeds gérés sur ce serveur')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un embed persistant')
            .addStringOption(o => o.setName('id').setDescription('ID de l’embed').setRequired(true))
            .addBooleanOption(o => o.setName('supprimer_message_discord').setDescription('Supprimer aussi le message Discord (défaut: oui)').setRequired(false))
    );

Command({ name: 'embed', builder: embedBuilder })(EmbedBuilderCommands.prototype, 'executeMain');

module.exports = { EmbedBuilderCommands };
