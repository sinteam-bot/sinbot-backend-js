/**
 * src/modules/util_sticky_messages/commands/sticky.cmd.js
 *
 * Commandes Slash /sticky (Phase 14 G28).
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { StickyService } = require('../services/sticky.service.js');

class StickyCommands {
    static inject = [StickyService];

    constructor(service) {
        this.service = service;
    }

    async executeSet(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const channel = interaction.options.getChannel('salon');
        const content = interaction.options.getString('message');
        const cooldown = interaction.options.getInteger('cooldown_messages') || 1;

        const res = await this.service.setSticky({
            guildId: interaction.guild.id,
            channelId: channel.id,
            content,
            cooldownMessages: cooldown,
            client: interaction.client
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `📌 Sticky message configuré pour <#${channel.id}>. Il restera toujours affiché en bas de salon (fréquence: tous les ${cooldown} message(s)).`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const list = await this.service.listSticky(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun sticky message configuré sur ce serveur.', ephemeral: true });
        }

        const lines = list.map(s => `• <#${s.channelId}> — "${s.content.slice(0, 60)}..." (tous les ${s.cooldownMessages} msg)`);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📌 Sticky messages actifs (${list.length})`)
            .setDescription(lines.join('\n'));

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeRemove(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const channel = interaction.options.getChannel('salon');
        await this.service.removeSticky(interaction.guild.id, channel.id);

        return interaction.reply({ content: `✅ Sticky message retiré de <#${channel.id}>.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'set':    return this.executeSet(interaction);
            case 'list':   return this.executeList(interaction);
            case 'remove': return this.executeRemove(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const stickyBuilder = new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Configurer des messages persistants épinglés dynamiquement en bas de salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
        sub.setName('set')
            .setDescription('Définir un sticky message sur un salon')
            .addChannelOption(o => o.setName('salon').setDescription('Salon cible').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName('message').setDescription('Texte du message à garder en bas').setRequired(true))
            .addIntegerOption(o => o.setName('cooldown_messages').setDescription('Seuil de messages avant repost (défaut: 1)').setRequired(false).setMinValue(1).setMaxValue(50))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les sticky messages du serveur')
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Supprimer le sticky message d’un salon')
            .addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true).addChannelTypes(ChannelType.GuildText))
    );

Command({ name: 'sticky', builder: stickyBuilder })(StickyCommands.prototype, 'executeMain');

module.exports = { StickyCommands };
