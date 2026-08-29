/**
 * word_triggers/commands/trigger-commands.js
 *
 * Commandes slash pour la feature word_triggers.
 *
 * Issue du split de game_engagement-advanced/ (Phase 9.2 du plan
 * migrate-to-c12). Avant : logique mélangée reminders+triggers+customcmd.
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { WordTriggerService } = require('../services/word-trigger.service.js');

class WordtriggersCommands {
    static inject = [WordTriggerService];
    constructor(service) { this.service = service; }

     executeTriggerAdd(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const triggerText = interaction.options.getString('trigger');
        const responseText = interaction.options.getString('response');
        const matchType = interaction.options.getString('match') || 'exact';
        const r = await this.trigger.create({
            guildId: interaction.guild.id,
            triggerText,
            responseText,
            matchType
        });
        if (!r.ok) {
            const messages = {
                already_exists: '❌ Ce trigger existe déjà',
                missing_params: '❌ Paramètres manquants'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Trigger ajouté : \`${triggerText}\` (${matchType})`, ephemeral: true });
        const list = await this.trigger.list(interaction.guild.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucun trigger configuré.', ephemeral: true });
        const lines = list.map(t => `• \`${t.id.slice(0, 8)}\` [${t.matchType}] \`${t.triggerText}\` → *${t.responseText.slice(0, 50)}*`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎯 Triggers configurés')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const idPrefix = interaction.options.getString('id');
        const list = await this.trigger.list(interaction.guild.id);
        const target = list.find(t => t.id.startsWith(idPrefix));
        if (!target) return interaction.reply({ content: '❌ Trigger introuvable', ephemeral: true });
        await this.trigger.delete(target.id);
        return interaction.reply({ content: `✅ Trigger \`${target.triggerText}\` supprimé`, ephemeral: true });

     executeTriggerList(interaction) {
        const list = await this.trigger.list(interaction.guild.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucun trigger configuré.', ephemeral: true });
        const lines = list.map(t => `• \`${t.id.slice(0, 8)}\` [${t.matchType}] \`${t.triggerText}\` → *${t.responseText.slice(0, 50)}*`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎯 Triggers configurés')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const idPrefix = interaction.options.getString('id');
        const list = await this.trigger.list(interaction.guild.id);
        const target = list.find(t => t.id.startsWith(idPrefix));
        if (!target) return interaction.reply({ content: '❌ Trigger introuvable', ephemeral: true });
        await this.trigger.delete(target.id);
        return interaction.reply({ content: `✅ Trigger \`${target.triggerText}\` supprimé`, ephemeral: true });

     executeTriggerRemove(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const idPrefix = interaction.options.getString('id');
        const list = await this.trigger.list(interaction.guild.id);
        const target = list.find(t => t.id.startsWith(idPrefix));
        if (!target) return interaction.reply({ content: '❌ Trigger introuvable', ephemeral: true });
        await this.trigger.delete(target.id);
        return interaction.reply({ content: `✅ Trigger \`${target.triggerText}\` supprimé`, ephemeral: true });

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

const customCmdBuilder = new SlashCommandBuilder()
    .setName('customcmd')
    .setDescription('Gestion des commandes personnalisées avec préfixe !')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter une commande personnalisée (admin)')
            .addStringOption(o => o.setName('name').setDescription('Nom de la commande (sans préfixe !)').setRequired(true).setMaxLength(32))
            .addStringOption(o => o.setName('response').setDescription('Réponse du bot').setRequired(true).setMaxLength(500))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Voir les commandes personnalisées')
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Supprimer une commande personnalisée (admin)')
            .addStringOption(o => o.setName('name').setDescription('Nom de la commande').setRequired(true).setMaxLength(32))
    );

Command({ name: 'remind', builder: remindBuilder })(EngagementAdvancedCommands.prototype, 'executeRemindMain');
Command({ name: 'trigger', builder: triggerBuilder })(EngagementAdvancedCommands.prototype, 'executeTriggerMain');
