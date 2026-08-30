/**
 * src/modules/automation_scheduler/commands/scheduler.cmd.js
 *
 * Commandes Slash pour les messages programmés et templates rotatifs (Module P6).
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
        const name = interaction.options.getString('nom');
        const channel = interaction.options.getChannel('salon');
        const content = interaction.options.getString('message');
        const intervalMinutes = interaction.options.getInteger('intervalle_minutes');
        const cron = interaction.options.getString('cron');
        const timezone = interaction.options.getString('fuseau') || 'Europe/Paris';
        const autoClean = interaction.options.getBoolean('auto_clean') || false;
        const templateName = interaction.options.getString('template');
        const dateTimeStr = interaction.options.getString('date_heure'); // Format: YYYY-MM-DD HH:mm

        let isOneTime = false;
        let runAtTimestamp = null;

        if (dateTimeStr) {
            const parsed = new Date(dateTimeStr).getTime();
            if (isNaN(parsed) || parsed <= Date.now()) {
                return interaction.reply({ content: '❌ Date et heure invalides ou passées (Format attendu : "YYYY-MM-DD HH:mm", ex: 2026-12-31 20:00).', ephemeral: true });
            }
            isOneTime = true;
            runAtTimestamp = parsed;
        }

        const res = await this.service.createScheduledMessage({
            guildId: interaction.guild.id,
            name,
            channelId: channel.id,
            content,
            intervalMinutes: intervalMinutes || (isOneTime || cron ? null : 60),
            cron,
            timezone,
            autoClean,
            templateId: templateName,
            isOneTime,
            runAtTimestamp,
            createdBy: interaction.user.id
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        const details = isOneTime
            ? `prévu le <t:${Math.floor(runAtTimestamp / 1000)}:F>`
            : (cron ? `selon le cron \`${cron}\`` : `toutes les ${intervalMinutes || 60} min`);

        return interaction.reply({
            content: `✅ Message programmé **${name}** créé avec succès dans <#${channel.id}> (${details})${autoClean ? ' [Auto-Clean 🧹]' : ''} !`,
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
            const freq = m.isOneTime
                ? `📅 Ponctuel : <t:${Math.floor(m.nextRunAt / 1000)}:F>`
                : (m.cronExpression ? `Cron: \`${m.cronExpression}\`` : `Toutes les ${m.intervalMinutes} min`);
            const cleanTag = m.autoClean ? ' • 🧹 Auto-Clean' : '';
            const tmplTag = m.templateId ? ` • 🔄 Modèle: \`${m.templateId}\`` : '';
            return `• **${m.name}** [${status}] dans <#${m.channelId}>\n  └ ${freq}${cleanTag}${tmplTag}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`⏰ Messages programmés (${list.length})`)
            .setDescription(lines.join('\n\n'))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    async executeDelete(interaction) {
        const identifier = interaction.options.getString('nom_ou_id');
        let item = await this.repo.getScheduledMessageByName(interaction.guild.id, identifier);
        if (!item) item = await this.repo.getScheduledMessage(identifier);

        if (!item || item.guildId !== interaction.guild.id) {
            return interaction.reply({ content: `❌ Message programmé "${identifier}" introuvable.`, ephemeral: true });
        }

        await this.service.delete(item.id);
        return interaction.reply({ content: `✅ Message programmé **${item.name}** supprimé.`, ephemeral: true });
    }

    async executeToggle(interaction) {
        const identifier = interaction.options.getString('nom_ou_id');
        let item = await this.repo.getScheduledMessageByName(interaction.guild.id, identifier);
        if (!item) item = await this.repo.getScheduledMessage(identifier);

        if (!item || item.guildId !== interaction.guild.id) {
            return interaction.reply({ content: `❌ Message programmé "${identifier}" introuvable.`, ephemeral: true });
        }

        const res = await this.service.toggle(item.id);
        if (!res.ok) return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });

        const stateStr = res.data.enabled ? 'activé 🟢' : 'mis en pause 🔴';
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

    // =================== TEMPLATES ===================

    async executeTemplateAdd(interaction) {
        const name = interaction.options.getString('nom');
        const itemText = interaction.options.getString('element');

        const tmpl = await this.service.addTemplateItem(interaction.guild.id, name, itemText);
        return interaction.reply({
            content: `✅ Élément ajouté à la rotation **${tmpl.name}** (Total : ${tmpl.items.length} éléments).`,
            ephemeral: true
        });
    }

    async executeTemplateList(interaction) {
        const list = await this.service.listTemplates(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun groupe de templates rotatifs.', ephemeral: true });
        }

        const lines = list.map(t => `• \`${t.name}\` — ${t.items.length} éléments (Index actuel : ${t.currentIndex + 1})`);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🔄 Templates rotatifs (${list.length})`)
            .setDescription(lines.join('\n'));

        return interaction.reply({ embeds: [embed] });
    }

    async executeTemplateDelete(interaction) {
        const name = interaction.options.getString('nom');
        await this.service.deleteTemplate(interaction.guild.id, name);
        return interaction.reply({ content: `✅ Groupe de templates \`${name}\` supprimé.`, ephemeral: true });
    }

    async executeTemplateMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeTemplateAdd(interaction);
            case 'list':   return this.executeTemplateList(interaction);
            case 'delete': return this.executeTemplateDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const schedulerBuilder = new SlashCommandBuilder()
    .setName('schedule-message')
    .setDescription('Gestion des messages programmés ponctuels et périodiques')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('create')
            .setDescription('Programmer un message ponctuel ou récurrent')
            .addStringOption(o => o.setName('nom').setDescription('Nom / Identifiant unique').setRequired(true))
            .addChannelOption(o => o.setName('salon').setDescription('Salon de diffusion').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
            .addStringOption(o => o.setName('message').setDescription('Texte du message').setRequired(false))
            .addStringOption(o => o.setName('date_heure').setDescription('Pour un envoi unique : Date et Heure (ex: 2026-12-31 20:00)').setRequired(false))
            .addIntegerOption(o => o.setName('intervalle_minutes').setDescription('Intervalle en minutes (ex: 60)').setRequired(false).setMinValue(1))
            .addStringOption(o => o.setName('cron').setDescription('Expression cron avancée (ex: 0 12 * * *)').setRequired(false))
            .addStringOption(o => o.setName('fuseau').setDescription('Fuseau horaire (ex: Europe/Paris, UTC)').setRequired(false))
            .addBooleanOption(o => o.setName('auto_clean').setDescription('Supprimer le message précédent à chaque envoi').setRequired(false))
            .addStringOption(o => o.setName('template').setDescription('Nom du template rotatif à diffuser').setRequired(false))
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

const templateBuilder = new SlashCommandBuilder()
    .setName('schedule-template')
    .setDescription('Gestion des templates et messages rotatifs')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter une entrée dans une rotation de templates')
            .addStringOption(o => o.setName('nom').setDescription('Nom de la rotation (ex: astuces)').setRequired(true))
            .addStringOption(o => o.setName('element').setDescription('Texte ou conseil à ajouter').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les rotations de templates')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer une rotation de templates')
            .addStringOption(o => o.setName('nom').setDescription('Nom de la rotation à supprimer').setRequired(true))
    );

Command({ name: 'schedule-message', builder: schedulerBuilder })(SchedulerCommands.prototype, 'executeMain');
Command({ name: 'schedule-template', builder: templateBuilder })(SchedulerCommands.prototype, 'executeTemplateMain');

module.exports = { SchedulerCommands };
