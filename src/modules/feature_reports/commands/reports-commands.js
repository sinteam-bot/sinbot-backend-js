/**
 * /reports (staff side)
 *   - /reports list [status:open] [limit:10]
 *   - /reports resolve id:... action:warn [notes:...]
 *   - /reports dismiss id:... [notes:...]
 *   - /reports stats
 *
 * Note : le report "user" se fait via context menu "Report user"
 * ou via le bouton 🚩 Report sur un message (géré par le listener).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ApplicationCommandType, ContextMenuCommandBuilder } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { ReportsService } = require('../services/reports.service.js');

function isStaff(interaction) {
    return interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages);
}

class ReportsCommands {
    static inject = [ReportsService];

    constructor(service) {
        this.service = service;
    }

    async executeList(interaction) {
        if (!isStaff(interaction)) {
            return interaction.reply({ content: '❌ Réservé au staff (ManageMessages)', ephemeral: true });
        }
        const status = interaction.options.getString('status') || 'open';
        const limit = Math.min(interaction.options.getInteger('limit') || 10, 25);
        const list = await this.service.list(interaction.guild.id, { status, limit, offset: 0 });
        if (list.length === 0) {
            return interaction.reply({ content: `ℹ️ Aucun report ${status}.`, ephemeral: true });
        }
        const lines = list.map(r => `• \`${r.id.slice(0, 8)}\` <@${r.reporterId}> → <@${r.reportedId}> **${r.reason.slice(0, 60)}**`);
        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle(`🚩 Reports (${status}, ${list.length})`)
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeResolve(interaction) {
        if (!isStaff(interaction)) {
            return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const action = interaction.options.getString('action') || 'custom';
        const notes = interaction.options.getString('notes') || null;
        const r = await this.service.resolve(id, interaction.user.id, action, notes);
        if (!r.ok) {
            const messages = {
                not_found: '❌ Report introuvable',
                not_open: '❌ Report déjà résolu ou rejeté'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Report résolu. Action : **${action}**${notes ? ` (${notes})` : ''}`, ephemeral: true });
    }

    async executeDismiss(interaction) {
        if (!isStaff(interaction)) {
            return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const notes = interaction.options.getString('notes') || null;
        const r = await this.service.dismiss(id, interaction.user.id, notes);
        if (!r.ok) {
            const messages = {
                not_found: '❌ Report introuvable',
                not_open: '❌ Report déjà résolu ou rejeté'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: '✅ Report rejeté.', ephemeral: true });
    }

    async executeStats(interaction) {
        if (!isStaff(interaction)) {
            return interaction.reply({ content: '❌ Réservé au staff', ephemeral: true });
        }
        const stats = await this.service.stats(interaction.guild.id);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('📊 Statistiques de signalements')
            .addFields(
                { name: 'Ouverts', value: String(stats.open), inline: true },
                { name: 'Résolus', value: String(stats.resolved), inline: true },
                { name: 'Rejetés', value: String(stats.dismissed), inline: true },
                { name: 'Total', value: String(stats.total), inline: true }
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

const listBuilder = new SlashCommandBuilder()
    .setName('reports-list')
    .setDescription('Lister les signalements (staff)')
    .addStringOption(o => o.setName('status').setDescription('Status').setRequired(false).addChoices(
        { name: 'open (par défaut)', value: 'open' },
        { name: 'resolved', value: 'resolved' },
        { name: 'dismissed', value: 'dismissed' }
    ))
    .addIntegerOption(o => o.setName('limit').setDescription('Nombre max (défaut 10)').setRequired(false).setMinValue(1).setMaxValue(25))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const resolveBuilder = new SlashCommandBuilder()
    .setName('reports-resolve')
    .setDescription('Résoudre un signalement (staff)')
    .addStringOption(o => o.setName('id').setDescription('ID du report').setRequired(true).setMaxLength(40))
    .addStringOption(o => o.setName('action').setDescription('Action prise').setRequired(false).addChoices(
        { name: 'warn (avertissement)', value: 'warn' },
        { name: 'kick', value: 'kick' },
        { name: 'ban', value: 'ban' },
        { name: 'mute / timeout', value: 'mute' },
        { name: 'custom (aucune action)', value: 'custom' }
    ))
    .addStringOption(o => o.setName('notes').setDescription('Notes internes (optionnel)').setRequired(false).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const dismissBuilder = new SlashCommandBuilder()
    .setName('reports-dismiss')
    .setDescription('Rejeter un signalement (staff)')
    .addStringOption(o => o.setName('id').setDescription('ID du report').setRequired(true).setMaxLength(40))
    .addStringOption(o => o.setName('notes').setDescription('Notes internes (optionnel)').setRequired(false).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const statsBuilder = new SlashCommandBuilder()
    .setName('reports-stats')
    .setDescription('Statistiques de signalements (staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

Command({ name: 'reports-list', builder: listBuilder })(ReportsCommands.prototype, 'executeList');
Command({ name: 'reports-resolve', builder: resolveBuilder })(ReportsCommands.prototype, 'executeResolve');
Command({ name: 'reports-dismiss', builder: dismissBuilder })(ReportsCommands.prototype, 'executeDismiss');
Command({ name: 'reports-stats', builder: statsBuilder })(ReportsCommands.prototype, 'executeStats');

module.exports = { ReportsCommands };
