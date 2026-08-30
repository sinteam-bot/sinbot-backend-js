/**
 * src/modules/community_starboard/commands/starboard.cmd.js
 *
 * Commandes Slash pour le module Starboard (Phase 7 G05).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { StarboardService } = require('../services/starboard.service.js');
const { StarboardRepository } = require('../services/starboard.repository.js');

class StarboardCommands {
    static inject = [StarboardService, StarboardRepository];

    constructor(service, repo) {
        this.service = service;
        this.repo = repo;
    }

    async executeConfig(interaction) {
        const cfg = this.service.getConfig(interaction.guild.id);
        const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('⭐ Configuration du Starboard')
            .addFields(
                { name: 'Statut', value: cfg.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: 'Salon', value: cfg.channel_id ? `<#${cfg.channel_id}>` : '*Non configuré*', inline: true },
                { name: 'Seuil', value: `${cfg.threshold} réactions`, inline: true },
                { name: 'Émoji', value: `${cfg.emoji}`, inline: true },
                { name: 'Auto-étoile', value: cfg.self_star ? 'Oui' : 'Non', inline: true },
                { name: 'NSFW autorisé', value: cfg.allow_nsfw ? 'Oui' : 'Non', inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    async executeTop(interaction) {
        const top = await this.repo.listTopEntries(interaction.guild.id, 10);
        if (top.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun message étoilé sur ce serveur pour le moment.', ephemeral: true });
        }

        const lines = top.map((entry, index) => {
            const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '⭐'));
            return `${medal} **#${index + 1}** — ⭐ **${entry.reactionCount}** par <@${entry.authorId}> dans <#${entry.sourceChannelId}> ([Voir message](https://discord.com/channels/${entry.guildId}/${entry.sourceChannelId}/${entry.sourceMessageId}))`;
        });

        const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('🏆 Top des messages du Starboard')
            .setDescription(lines.join('\n\n'))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
}

const configBuilder = new SlashCommandBuilder()
    .setName('starboard-config')
    .setDescription('Afficher la configuration actuelle du Starboard');

const topBuilder = new SlashCommandBuilder()
    .setName('starboard-top')
    .setDescription('Afficher les messages les plus étoilés du serveur');

Command({ name: 'starboard-config', builder: configBuilder })(StarboardCommands.prototype, 'executeConfig');
Command({ name: 'starboard-top', builder: topBuilder })(StarboardCommands.prototype, 'executeTop');

module.exports = { StarboardCommands };
