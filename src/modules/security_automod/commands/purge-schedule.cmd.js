/**
 * src/modules/security_automod/commands/purge-schedule.cmd.js
 *
 * Commandes Slash pour la gestion des purges programmées (Phase 12 G39).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { ScheduledPurgeService } = require('../services/scheduled-purge.service.js');

class PurgeScheduleCommands {
    static inject = [ScheduledPurgeService];

    constructor(service) {
        this.service = service;
    }

    async executeSetup(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs / modérateurs (ManageMessages).', ephemeral: true });
        }

        const channel = interaction.options.getChannel('salon');
        const intervalHours = interaction.options.getInteger('intervalle_heures');
        const keepPinned = interaction.options.getBoolean('garder_epingles') ?? true;

        const res = await this.service.setupPurge({
            guildId: interaction.guild.id,
            channelId: channel.id,
            intervalHours,
            keepPinned
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Purge automatique activée sur <#${channel.id}> toutes les **${intervalHours}h** (Messages épinglés conservés : ${keepPinned ? 'Oui' : 'Non'}).`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const purges = await this.service.listPurges(interaction.guild.id);
        if (purges.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucune purge automatique configurée sur ce serveur.', ephemeral: true });
        }

        const lines = purges.map(p => {
            const lastPurgeStr = p.lastPurgeAt > 0 ? `<t:${Math.floor(p.lastPurgeAt / 1000)}:R>` : 'Jamais';
            return `• <#${p.channelId}> — Toutes les **${p.intervalHours}h** (Épinglés : ${p.keepPinned ? 'gardés' : 'supprimés'}) — Dernière purge : ${lastPurgeStr}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🧹 Purges programmées (${purges.length})`)
            .setDescription(lines.join('\n'));

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeDelete(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs / modérateurs (ManageMessages).', ephemeral: true });
        }

        const channel = interaction.options.getChannel('salon');
        await this.service.deletePurge(interaction.guild.id, channel.id);

        return interaction.reply({
            content: `✅ Purge automatique désactivée pour <#${channel.id}>.`,
            ephemeral: true
        });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'setup':  return this.executeSetup(interaction);
            case 'list':   return this.executeList(interaction);
            case 'delete': return this.executeDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const purgeBuilder = new SlashCommandBuilder()
    .setName('purge-schedule')
    .setDescription('Configuration des purges automatiques récurrentes de salons')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
        sub.setName('setup')
            .setDescription('Configurer une purge périodique sur un salon')
            .addChannelOption(o => o.setName('salon').setDescription('Le salon à purger').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addIntegerOption(o => o.setName('intervalle_heures').setDescription('Intervalle en heures (ex: 12, 24)').setRequired(true).setMinValue(1).setMaxValue(720))
            .addBooleanOption(o => o.setName('garder_epingles').setDescription('Conserver les messages épinglés (défaut: oui)').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les salons avec purge automatique')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer la purge automatique d’un salon')
            .addChannelOption(o => o.setName('salon').setDescription('Le salon').setRequired(true).addChannelTypes(ChannelType.GuildText))
    );

Command({ name: 'purge-schedule', builder: purgeBuilder })(PurgeScheduleCommands.prototype, 'executeMain');

module.exports = { PurgeScheduleCommands };
