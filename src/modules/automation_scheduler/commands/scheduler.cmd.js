/**
 * src/modules/automation_scheduler/commands/scheduler.cmd.js
 *
 * Commandes Slash pour les messages programmés (Phase 8 G03).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { SchedulerService } = require('../services/scheduler.service.js');
const { SchedulerRepository } = require('../services/scheduler.repository.js');

class SchedulerCommands {
    static inject = [SchedulerService, SchedulerRepository];

    constructor(service, repo) {
        this.service = service;
        this.repo = repo;
    }

    async executeCreate(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageGuild).', ephemeral: true });
        }

        const name = interaction.options.getString('nom');
        const channel = interaction.options.getChannel('salon');
        const content = interaction.options.getString('message');
        const intervalMinutes = interaction.options.getInteger('intervalle_minutes') || 60;
        const cron = interaction.options.getString('cron');

        const res = await this.service.createScheduledMessage({
            guildId: interaction.guild.id,
            name,
            channelId: channel.id,
            content,
            intervalMinutes,
            cron,
            createdBy: interaction.user.id
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Message programmé **${name}** créé avec succès ! Il sera envoyé sur <#${channel.id}> toutes les ${intervalMinutes} minutes.`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const list = await this.service.list(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun message programmé sur ce serveur.', ephemeral: true });
        }

        const lines = list.map(m => {
            const status = m.enabled ? '🟢 Actif' : '🔴 En pause';
            const nextDate = new Date(m.nextRunAt).toLocaleString('fr-FR');
            const freq = m.cronExpression ? `Cron: \`${m.cronExpression}\`` : `Toutes les ${m.intervalMinutes} min`;
            return `• **${m.name}** [${status}] dans <#${m.channelId}>\n  └ ${freq} — Prochaine : <t:${Math.floor(m.nextRunAt / 1000)}:R>`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏰ Messages programmés du serveur')
            .setDescription(lines.join('\n\n'))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    async executeDelete(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageGuild).', ephemeral: true });
        }

        const identifier = interaction.options.getString('nom_ou_id');
        let item = await this.repo.getScheduledMessageByName(interaction.guild.id, identifier);
        if (!item) {
            item = await this.repo.getScheduledMessage(identifier);
        }

        if (!item || item.guildId !== interaction.guild.id) {
            return interaction.reply({ content: `❌ Message programmé "${identifier}" introuvable.`, ephemeral: true });
        }

        await this.service.delete(item.id);
        return interaction.reply({ content: `✅ Message programmé **${item.name}** supprimé.`, ephemeral: true });
    }

    async executeToggle(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageGuild).', ephemeral: true });
        }

        const identifier = interaction.options.getString('nom_ou_id');
        let item = await this.repo.getScheduledMessageByName(interaction.guild.id, identifier);
        if (!item) {
            item = await this.repo.getScheduledMessage(identifier);
        }

        if (!item || item.guildId !== interaction.guild.id) {
            return interaction.reply({ content: `❌ Message programmé "${identifier}" introuvable.`, ephemeral: true });
        }

        const res = await this.service.toggle(item.id);
        if (!res.ok) return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });

        const stateStr = res.data.enabled ? 'activé 🟢' : 'désactivé / mis en pause 🔴';
        return interaction.reply({ content: `✅ Message programmé **${item.name}** ${stateStr}.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'create': return this.executeCreate(interaction);
            case 'list':   return this.executeList(interaction);
            case 'delete': return this.executeDelete(interaction);
            case 'toggle': return this.executeToggle(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const schedulerBuilder = new SlashCommandBuilder()
    .setName('schedule-message')
    .setDescription('Gestion des messages périodiques automatiques')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('create')
            .setDescription('Programmer un nouveau message périodique')
            .addStringOption(o => o.setName('nom').setDescription('Identifiant / Nom du message').setRequired(true))
            .addChannelOption(o => o.setName('salon').setDescription('Salon de diffusion').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
            .addStringOption(o => o.setName('message').setDescription('Contenu du message (supporte les tags)').setRequired(true))
            .addIntegerOption(o => o.setName('intervalle_minutes').setDescription('Intervalle en minutes (ex: 60)').setRequired(false).setMinValue(1))
            .addStringOption(o => o.setName('cron').setDescription('Expression cron avancée (optionnel)').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister tous les messages programmés')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un message programmé')
            .addStringOption(o => o.setName('nom_ou_id').setDescription('Nom ou ID du message').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('toggle')
            .setDescription('Mettre en pause ou réactiver un message programmé')
            .addStringOption(o => o.setName('nom_ou_id').setDescription('Nom ou ID du message').setRequired(true))
    );

Command({ name: 'schedule-message', builder: schedulerBuilder })(SchedulerCommands.prototype, 'executeMain');

module.exports = { SchedulerCommands };
