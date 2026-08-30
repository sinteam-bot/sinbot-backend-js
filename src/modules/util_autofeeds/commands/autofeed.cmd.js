/**
 * src/modules/util_autofeeds/commands/autofeed.cmd.js
 *
 * Commandes Slash /autofeed (Phase 14 G23).
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { AutofeedsService } = require('../services/autofeeds.service.js');

class AutofeedCommands {
    static inject = [AutofeedsService];

    constructor(service) {
        this.service = service;
    }

    async executeAdd(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const feedUrl = interaction.options.getString('url');
        const channel = interaction.options.getChannel('salon');
        const interval = interaction.options.getInteger('intervalle_minutes') || 15;

        const res = await this.service.addFeed({
            guildId: interaction.guild.id,
            channelId: channel.id,
            feedUrl,
            intervalMinutes: interval
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Flux RSS/Atom ajouté avec succès. Les nouveaux articles seront publiés dans <#${channel.id}> (ID: \`${res.data.id}\`).`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const list = await this.service.listFeeds(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun flux RSS/Atom configuré sur ce serveur.', ephemeral: true });
        }

        const lines = list.map(f => `• \`${f.id}\` — [${f.feedUrl}](${f.feedUrl}) -> <#${f.channelId}> (${f.intervalMinutes}m)`);
        const embed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle(`📰 Flux RSS/Atom (${list.length})`)
            .setDescription(lines.join('\n'));

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeDelete(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const id = interaction.options.getString('id');
        await this.service.deleteFeed(id);

        return interaction.reply({ content: `✅ Flux \`${id}\` supprimé.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeAdd(interaction);
            case 'list':   return this.executeList(interaction);
            case 'delete': return this.executeDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const autofeedBuilder = new SlashCommandBuilder()
    .setName('autofeed')
    .setDescription('Gestion des flux RSS/Atom automatiques')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter un flux RSS/Atom')
            .addStringOption(o => o.setName('url').setDescription('URL du flux RSS/Atom').setRequired(true))
            .addChannelOption(o => o.setName('salon').setDescription('Salon de publication').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addIntegerOption(o => o.setName('intervalle_minutes').setDescription('Intervalle de vérification en minutes (défaut: 15)').setRequired(false).setMinValue(5).setMaxValue(1440))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les flux RSS/Atom du serveur')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un flux RSS/Atom')
            .addStringOption(o => o.setName('id').setDescription('ID du flux').setRequired(true))
    );

Command({ name: 'autofeed', builder: autofeedBuilder })(AutofeedCommands.prototype, 'executeMain');

module.exports = { AutofeedCommands };
