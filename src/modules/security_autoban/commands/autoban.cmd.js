/**
 * src/modules/security_autoban/commands/autoban.cmd.js
 *
 * Commandes Slash pour le module Autoban (Phase 11 G17).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { AutobanService } = require('../services/autoban.service.js');

class AutobanCommands {
    static inject = [AutobanService];

    constructor(service) {
        this.service = service;
    }

    async executeStatus(interaction) {
        const state = await featureRegistry.get(interaction.guild.id, 'autoban');
        const cfg = state.config || {};

        const embed = new EmbedBuilder()
            .setColor(state.enabled ? 0x57F287 : 0xED4245)
            .setTitle('🛡️ Configuration Autoban')
            .setDescription(`Statut : **${state.enabled ? 'Activé' : 'Désactivé'}**`)
            .addFields(
                { name: 'Âge minimal du compte', value: `${cfg.min_account_age_hours || 0} heures`, inline: true },
                { name: 'Bloquer avatar par défaut', value: cfg.block_default_avatar ? 'Oui' : 'Non', inline: true },
                { name: 'Action appliquée', value: `\`${cfg.action || 'ban'}\``, inline: true },
                { name: 'Filtres pseudo (regex)', value: cfg.username_blacklist_regex?.length ? cfg.username_blacklist_regex.map(r => `\`${r}\``).join(', ') : 'Aucun', inline: false }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeLogs(interaction) {
        const logs = await this.service.listLogs(interaction.guild.id, 20);
        if (logs.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun log d’autoban récent.', ephemeral: true });
        }

        const lines = logs.map(l => {
            const timeSec = Math.floor(l.createdAt / 1000);
            return `• <t:${timeSec}:R> **${l.userTag || l.userId}** [${l.action.toUpperCase()}] : *${l.reason}*`;
        });

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle(`🚨 Historique Autoban (${logs.length})`)
            .setDescription(lines.join('\n'))
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeMain(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.BanMembers)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs / administrateurs.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'status': return this.executeStatus(interaction);
            case 'logs':   return this.executeLogs(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const autobanBuilder = new SlashCommandBuilder()
    .setName('autoban')
    .setDescription('Gestion et consultation des règles d’autoban')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addSubcommand(sub =>
        sub.setName('status')
            .setDescription('Afficher la configuration actuelle d’autoban')
    )
    .addSubcommand(sub =>
        sub.setName('logs')
            .setDescription('Consulter les dernières sanctions appliquées par autoban')
    );

Command({ name: 'autoban', builder: autobanBuilder })(AutobanCommands.prototype, 'executeMain');

module.exports = { AutobanCommands };
