/**
 * src/modules/community_suggestions/commands/suggestions.cmd.js
 *
 * Commandes Slash pour le module Suggestions (Phase 7 G12).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { SuggestionsService, STATUS_CONFIG } = require('../services/suggestions.service.js');
const { SuggestionsRepository } = require('../services/suggestions.repository.js');

class SuggestionsCommands {
    static inject = [SuggestionsService, SuggestionsRepository];

    constructor(service, repo) {
        this.service = service;
        this.repo = repo;
    }

    async executeSuggest(interaction) {
        const content = interaction.options.getString('contenu');
        const isAnonymous = interaction.options.getBoolean('anonyme') || false;

        const res = await this.service.submitSuggestion(
            interaction.guild.id,
            interaction.user,
            content,
            { client: interaction.client, isAnonymous }
        );

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Votre suggestion **#${res.data.suggestionNumber}** a été soumise avec succès !`,
            ephemeral: true
        });
    }

    async executeStatus(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Vous n\'avez pas la permission de gérer les suggestions.', ephemeral: true });
        }

        const identifier = interaction.options.getString('id_ou_numero');
        const status = interaction.options.getString('statut');
        const reason = interaction.options.getString('raison');

        const res = await this.service.updateStatus(
            interaction.guild.id,
            identifier,
            status,
            interaction.user,
            reason,
            { client: interaction.client }
        );

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        const statusMeta = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
        return interaction.reply({
            content: `✅ Suggestion **#${res.data.suggestionNumber}** mise à jour vers : **${statusMeta.label}** !`
        });
    }

    async executeList(interaction) {
        const status = interaction.options.getString('statut') || 'all';
        const list = await this.repo.listSuggestions(interaction.guild.id, { status, limit: 10 });

        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucune suggestion trouvée.', ephemeral: true });
        }

        const lines = list.map(s => {
            const statusMeta = STATUS_CONFIG[s.status] || STATUS_CONFIG.pending;
            const snippet = s.content.length > 80 ? s.content.slice(0, 77) + '...' : s.content;
            return `**#${s.suggestionNumber}** [${statusMeta.label}] — ${snippet}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`💡 Liste des suggestions (${status})`)
            .setDescription(lines.join('\n\n'))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    async executeConfig(interaction) {
        const cfg = this.service.getConfig(interaction.guild.id);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('💡 Configuration des Suggestions')
            .addFields(
                { name: 'Statut', value: cfg.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: 'Salon', value: cfg.channel_id ? `<#${cfg.channel_id}>` : '*Non configuré*', inline: true },
                { name: 'Réactions auto', value: cfg.auto_reactions ? cfg.auto_reactions.join(' ') : '👍 👎', inline: true },
                { name: 'Notifications MP', value: cfg.dm_notification ? 'Oui' : 'Non', inline: true },
                { name: 'Anonymat permis', value: cfg.anonymous_allowed ? 'Oui' : 'Non', inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
}

const suggestBuilder = new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Soumettre une nouvelle suggestion pour le serveur')
    .addStringOption(o => o.setName('contenu').setDescription('Texte de votre suggestion').setRequired(true))
    .addBooleanOption(o => o.setName('anonyme').setDescription('Poster anonymement').setRequired(false));

const statusBuilder = new SlashCommandBuilder()
    .setName('suggestion-status')
    .setDescription('Modifier le statut d\'une suggestion (Staff)')
    .addStringOption(o => o.setName('id_ou_numero').setDescription('Numéro (#1) ou ID de la suggestion').setRequired(true))
    .addStringOption(o => o.setName('statut').setDescription('Nouveau statut')
        .setRequired(true)
        .addChoices(
            { name: '✅ Approuvée', value: 'approved' },
            { name: '❌ Refusée', value: 'rejected' },
            { name: '🎉 Implémentée', value: 'implemented' },
            { name: '🕒 En attente', value: 'pending' }
        ))
    .addStringOption(o => o.setName('raison').setDescription('Raison ou commentaire explicatif').setRequired(false));

const listBuilder = new SlashCommandBuilder()
    .setName('suggestion-list')
    .setDescription('Afficher la liste des suggestions récentes')
    .addStringOption(o => o.setName('statut').setDescription('Filtrer par statut')
        .setRequired(false)
        .addChoices(
            { name: 'Toutes', value: 'all' },
            { name: 'En attente', value: 'pending' },
            { name: 'Approuvées', value: 'approved' },
            { name: 'Refusées', value: 'rejected' },
            { name: 'Implémentées', value: 'implemented' }
        ));

const configBuilder = new SlashCommandBuilder()
    .setName('suggestion-config')
    .setDescription('Afficher la configuration du système de suggestions');

Command({ name: 'suggest', builder: suggestBuilder })(SuggestionsCommands.prototype, 'executeSuggest');
Command({ name: 'suggestion-status', builder: statusBuilder })(SuggestionsCommands.prototype, 'executeStatus');
Command({ name: 'suggestion-list', builder: listBuilder })(SuggestionsCommands.prototype, 'executeList');
Command({ name: 'suggestion-config', builder: configBuilder })(SuggestionsCommands.prototype, 'executeConfig');

module.exports = { SuggestionsCommands };
