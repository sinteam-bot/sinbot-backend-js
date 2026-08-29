/**
 * word_triggers/commands/trigger-commands.js
 *
 * Commandes slash pour la feature word_triggers.
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { WordTriggerService } = require('../services/word-trigger.service.js');

function isAdmin(interaction) {
    return interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) || false;
}

class WordTriggersCommands {
    static inject = [WordTriggerService];
    constructor(service) { this.service = service; }

    async executeTriggerAdd(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const triggerText = interaction.options.getString('trigger');
        const responseText = interaction.options.getString('response');
        const matchType = interaction.options.getString('match') || 'exact';
        const r = await this.service.create({
            guildId: interaction.guild.id,
            triggerText,
            responseText,
            matchType
        });
        if (!r.ok) {
            return interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Trigger créé : **${triggerText}** → ${responseText}`, ephemeral: true });
    }

    async executeTriggerList(interaction) {
        const list = await this.service.list(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun trigger configuré', ephemeral: true });
        }
        const lines = list.map(t => `• \`${t.id.slice(0, 8)}\` **${t.triggerText}** (${t.matchType}) → ${t.responseText?.slice(0, 50) || '_(embed)_'}`);
        return interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }

    async executeTriggerRemove(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const r = await this.service.delete(id);
        if (!r.ok) {
            return interaction.reply({ content: '❌ Trigger introuvable', ephemeral: true });
        }
        return interaction.reply({ content: '✅ Trigger supprimé', ephemeral: true });
    }

    async executeTriggerMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeTriggerAdd(interaction);
            case 'list':   return this.executeTriggerList(interaction);
            case 'remove': return this.executeTriggerRemove(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const triggerBuilder = new SlashCommandBuilder()
    .setName('trigger')
    .setDescription('Gestion des mots-clés déclencheurs (triggers)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter un trigger de mot (admin)')
            .addStringOption(o => o.setName('trigger').setDescription('Mot-clé').setRequired(true).setMaxLength(100))
            .addStringOption(o => o.setName('response').setDescription('Réponse du bot').setRequired(true).setMaxLength(500))
            .addStringOption(o => o.setName('match').setDescription('Type de match').setRequired(false).addChoices(
                { name: 'exact', value: 'exact' },
                { name: 'contains', value: 'contains' }
            ))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Voir les triggers configurés')
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Supprimer un trigger (admin)')
            .addStringOption(o => o.setName('id').setDescription('ID du trigger (8 premiers caractères)').setRequired(true).setMaxLength(8))
    );

Command({ name: 'trigger', builder: triggerBuilder })(WordTriggersCommands.prototype, 'executeTriggerMain');

module.exports = { WordTriggersCommands };
