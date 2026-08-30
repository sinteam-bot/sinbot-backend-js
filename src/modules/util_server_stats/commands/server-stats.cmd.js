/**
 * src/modules/util_server_stats/commands/server-stats.cmd.js
 *
 * Commandes Slash pour les salons statistiques du serveur (Phase 9 G08).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { ServerStatsService, DEFAULT_FORMATS } = require('../services/server-stats.service.js');

class ServerStatsCommands {
    static inject = [ServerStatsService];

    constructor(statsService) {
        this.statsService = statsService;
    }

    async executeSetup(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageGuild).', ephemeral: true });
        }

        const statType = interaction.options.getString('type');
        const customFormat = interaction.options.getString('format');
        const format = customFormat || DEFAULT_FORMATS[statType];

        await interaction.deferReply({ ephemeral: true });

        // Créer un salon vocal verrouillé (non connectable) pour afficher la stat
        const initialName = this.statsService.formatChannelName(interaction.guild, statType, format);

        const channel = await interaction.guild.channels.create({
            name: initialName,
            type: ChannelType.GuildVoice,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.Connect]
                }
            ],
            reason: `Salon de statistiques configuré par ${interaction.user.tag}`
        });

        await this.statsService.registerChannel({
            guildId: interaction.guild.id,
            channelId: channel.id,
            statType,
            format
        });

        return interaction.editReply({
            content: `✅ Salon de statistiques <#${channel.id}> créé avec succès (\`${initialName}\`) !`
        });
    }

    async executeList(interaction) {
        const channels = await this.statsService.listChannels(interaction.guild.id);
        if (channels.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun salon de statistiques configuré sur ce serveur.', ephemeral: true });
        }

        const lines = channels.map(c => `• <#${c.channelId}> — Type : \`${c.statType}\` — Format : \`${c.format}\``);

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📊 Salons de statistiques du serveur')
            .setDescription(lines.join('\n'))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    async executeUpdate(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageGuild).', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        await this.statsService.updateGuildStats(interaction.guild);
        return interaction.editReply({ content: '✅ Salons de statistiques actualisés avec succès !' });
    }

    async executeDelete(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageGuild).', ephemeral: true });
        }

        const channel = interaction.options.getChannel('salon');
        await this.statsService.deleteChannel(interaction.guild.id, channel.id);

        return interaction.reply({
            content: `✅ Le salon <#${channel.id}> a été retiré des statistiques.`,
            ephemeral: true
        });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'setup':  return this.executeSetup(interaction);
            case 'list':   return this.executeList(interaction);
            case 'update': return this.executeUpdate(interaction);
            case 'delete': return this.executeDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const serverStatsBuilder = new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('Gestion des compteurs et salons de statistiques du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('setup')
            .setDescription('Créer un salon de statistiques vocales')
            .addStringOption(o =>
                o.setName('type')
                    .setDescription('Type de statistique à afficher')
                    .setRequired(true)
                    .addChoices(
                        { name: '👥 Membres totaux', value: 'total_members' },
                        { name: '👤 Membres humains', value: 'human_members' },
                        { name: '🤖 Bots', value: 'bot_members' },
                        { name: '📁 Nombre de salons', value: 'channel_count' },
                        { name: '🎭 Nombre de rôles', value: 'role_count' }
                    )
            )
            .addStringOption(o =>
                o.setName('format')
                    .setDescription('Format personnalisé (ex: "👥 Membres : {count}")')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les salons de statistiques')
    )
    .addSubcommand(sub =>
        sub.setName('update')
            .setDescription('Forcer l’actualisation des salons de statistiques')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Désactiver un salon de statistiques')
            .addChannelOption(o => o.setName('salon').setDescription('Le salon à retirer').setRequired(true))
    );

Command({ name: 'serverstats', builder: serverStatsBuilder })(ServerStatsCommands.prototype, 'executeMain');

module.exports = { ServerStatsCommands };
