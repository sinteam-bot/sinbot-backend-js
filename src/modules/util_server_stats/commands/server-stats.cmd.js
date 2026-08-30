/**
 * src/modules/util_server_stats/commands/server-stats.cmd.js
 *
 * Commandes Slash /serverstats et /statrole (Module P5 - Statbot).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { ServerStatsService, DEFAULT_FORMATS } = require('../services/server-stats.service.js');

class ServerStatsCommands {
    static inject = [ServerStatsService];

    constructor(statsService) {
        this.statsService = statsService;
    }

    async executeAutoSetup(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const res = await this.statsService.setupDefaultCounters(interaction.guild);
            return interaction.editReply({
                content: `✅ Catégorie et **${res.channels.length} salons compteurs** créés avec succès sous la catégorie <#${res.categoryId}> !`
            });
        } catch (err) {
            return interaction.editReply({ content: `❌ Erreur lors du setup : ${err.message}` });
        }
    }

    async executeSetup(interaction) {
        const statType = interaction.options.getString('type');
        const customFormat = interaction.options.getString('format');
        const role = interaction.options.getRole('role');
        const timezone = interaction.options.getString('fuseau') || 'Europe/Paris';
        const targetId = role?.id || null;
        const format = customFormat || DEFAULT_FORMATS[statType];

        await interaction.deferReply({ ephemeral: true });

        const initialName = this.statsService.formatChannelName(interaction.guild, statType, format, targetId, timezone);

        const channel = await interaction.guild.channels.create({
            name: initialName,
            type: ChannelType.GuildVoice,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.Connect]
                }
            ],
            reason: `Compteur configuré par ${interaction.user.tag}`
        });

        await this.statsService.registerChannel({
            guildId: interaction.guild.id,
            channelId: channel.id,
            statType,
            format,
            targetId,
            timezone
        });

        return interaction.editReply({
            content: `✅ Salon compteur <#${channel.id}> créé avec succès (\`${initialName}\`) !`
        });
    }

    async executeList(interaction) {
        const channels = await this.statsService.listChannels(interaction.guild.id);
        if (channels.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun salon compteur configuré sur ce serveur.', ephemeral: true });
        }

        const lines = channels.map(c => `• <#${c.channelId}> — Type : \`${c.statType}\` — Format : \`${c.format}\`${c.targetId ? ` (Rôle: <@&${c.targetId}>)` : ''}${c.timezone ? ` (TZ: \`${c.timezone}\`)` : ''}`);

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 Salons compteurs actifs (${channels.length})`)
            .setDescription(lines.join('\n'))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    async executeUpdate(interaction) {
        await interaction.deferReply({ ephemeral: true });
        await this.statsService.updateGuildStats(interaction.guild);
        return interaction.editReply({ content: '✅ Salons compteurs actualisés avec succès !' });
    }

    async executeDelete(interaction) {
        const channel = interaction.options.getChannel('salon');
        await this.statsService.deleteChannel(interaction.guild.id, channel.id);

        return interaction.reply({
            content: `✅ Le salon <#${channel.id}> a été retiré des compteurs.`,
            ephemeral: true
        });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'auto-setup': return this.executeAutoSetup(interaction);
            case 'setup':      return this.executeSetup(interaction);
            case 'list':       return this.executeList(interaction);
            case 'update':     return this.executeUpdate(interaction);
            case 'delete':     return this.executeDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }

    // =================== STATROLES ===================

    async executeStatroleAdd(interaction) {
        const role = interaction.options.getRole('role');
        const type = interaction.options.getString('type');
        const threshold = interaction.options.getInteger('seuil');

        const sr = await this.statsService.addStatrole({
            guildId: interaction.guild.id,
            roleId: role.id,
            type,
            threshold
        });

        const labels = {
            messages: 'messages postés',
            voice_minutes: 'minutes en vocal',
            days_in_guild: 'jours d\'ancienneté'
        };

        return interaction.reply({
            content: `✅ Statrole configuré : <@&${role.id}> sera attribué dès **${sr.threshold} ${labels[type] || type}**.`,
            ephemeral: true
        });
    }

    async executeStatroleList(interaction) {
        const list = await this.statsService.listStatroles(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun Statrole configuré.', ephemeral: true });
        }

        const lines = list.map(sr => `• <@&${sr.roleId}> — Requis : **${sr.threshold}** (\`${sr.type}\`)`);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🎭 Statroles / Rôles d'activité (${list.length})`)
            .setDescription(lines.join('\n'));

        return interaction.reply({ embeds: [embed] });
    }

    async executeStatroleDelete(interaction) {
        const role = interaction.options.getRole('role');
        await this.statsService.deleteStatrole(interaction.guild.id, role.id);
        return interaction.reply({ content: `✅ Statrole pour <@&${role.id}> supprimé.`, ephemeral: true });
    }

    async executeStatroleMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeStatroleAdd(interaction);
            case 'list':   return this.executeStatroleList(interaction);
            case 'delete': return this.executeStatroleDelete(interaction);
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
        sub.setName('auto-setup')
            .setDescription('Déployer automatiquement une catégorie avec les 4 compteurs principaux')
    )
    .addSubcommand(sub =>
        sub.setName('setup')
            .setDescription('Créer un salon compteur vocal sur-mesure')
            .addStringOption(o =>
                o.setName('type')
                    .setDescription('Type de statistique à afficher')
                    .setRequired(true)
                    .addChoices(
                        { name: '👥 Membres totaux', value: 'total_members' },
                        { name: '👤 Membres humains', value: 'human_members' },
                        { name: '🤖 Bots', value: 'bot_members' },
                        { name: '🟢 En ligne', value: 'online_members' },
                        { name: '🚀 Boosts Nitro', value: 'boost_count' },
                        { name: '👑 Membres d’un rôle', value: 'role_members' },
                        { name: '📁 Nombre de salons', value: 'channel_count' },
                        { name: '🎭 Nombre de rôles', value: 'role_count' },
                        { name: '🕒 Horloge fuseau horaire', value: 'clock' }
                    )
            )
            .addStringOption(o =>
                o.setName('format')
                    .setDescription('Format personnalisé (ex: "👥 Membres : {count}")')
                    .setRequired(false)
            )
            .addRoleOption(o =>
                o.setName('role')
                    .setDescription('Rôle concerné (requis si type = "Membres d’un rôle")')
                    .setRequired(false)
            )
            .addStringOption(o =>
                o.setName('fuseau')
                    .setDescription('Fuseau horaire pour l’horloge (ex: "Europe/Paris", "UTC")')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les salons compteurs')
    )
    .addSubcommand(sub =>
        sub.setName('update')
            .setDescription('Forcer l’actualisation des salons compteurs')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Désactiver un salon compteur')
            .addChannelOption(o => o.setName('salon').setDescription('Le salon à retirer').setRequired(true))
    );

const statroleBuilder = new SlashCommandBuilder()
    .setName('statrole')
    .setDescription('Gestion des statroles / rôles d’activité automatique')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter un rôle d’activité')
            .addRoleOption(o => o.setName('role').setDescription('Le rôle à attribuer').setRequired(true))
            .addStringOption(o =>
                o.setName('type')
                    .setDescription('Critère d’attribution')
                    .setRequired(true)
                    .addChoices(
                        { name: '💬 Messages envoyés', value: 'messages' },
                        { name: '🎙️ Minutes en vocal', value: 'voice_minutes' },
                        { name: '📅 Jours d’ancienneté', value: 'days_in_guild' }
                    )
            )
            .addIntegerOption(o => o.setName('seuil').setDescription('Seuil requis').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les statroles configurés')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un statrole')
            .addRoleOption(o => o.setName('role').setDescription('Le rôle à supprimer des statroles').setRequired(true))
    );

Command({ name: 'serverstats', builder: serverStatsBuilder })(ServerStatsCommands.prototype, 'executeMain');
Command({ name: 'statrole', builder: statroleBuilder })(ServerStatsCommands.prototype, 'executeStatroleMain');

module.exports = { ServerStatsCommands };
