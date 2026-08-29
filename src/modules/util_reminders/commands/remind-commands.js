/**
 * reminders/commands/remind-commands.js
 *
 * Commandes slash pour la feature reminders.
 *
 * Issue du split de game_engagement-advanced/ (Phase 9.2 du plan
 * migrate-to-c12). Avant : logique mélangée reminders+triggers+customcmd.
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { ReminderService } = require('../services/reminder.service.js');

class RemindersCommands {
    static inject = [ReminderService];
    constructor(service) { this.service = service; }

     executeRemindMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'set':    return this.executeRemindSet(interaction);
            case 'list':   return this.executeRemindersList(interaction);
            case 'cancel': return this.executeReminderCancel(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
        const duration = interaction.options.getString('duration');
        const message = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel');
        const ms = this._parseDuration(duration);
        if (!ms) return interaction.reply({ content: '❌ Durée invalide (ex: 30m, 2h, 1d)', ephemeral: true });
        if (ms < 30_000) return interaction.reply({ content: '❌ Durée min 30 secondes', ephemeral: true });
        const fireAt = Date.now() + ms;
        const r = await this.reminder.createReminder({
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            channelId: channel?.id || null,
            text: message,
            fireAt
        });
        if (!r.ok) {
            const messages = {
                cooldown: '❌ Attendez 5s entre deux rappels',
                fire_at_in_past: '❌ La durée doit être dans le futur',
                missing_params: '❌ Paramètres manquants'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        const target = channel ? `dans ${channel}` : 'en DM';
        return interaction.reply({ content: `✅ Rappel programmé ${target} pour <t:${Math.floor(fireAt/1000)}:R> : **${message}**`, ephemeral: true });
        const list = await this.reminder.listByUser(interaction.user.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucun rappel actif.', ephemeral: true });
        const lines = list.map(r => `• \`${r.id.slice(0, 8)}\` <t:${Math.floor(r.fireAt/1000)}:R> — ${r.reminderText.slice(0, 50)}`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('⏰ Vos rappels actifs')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
        const id = interaction.options.getString('id');
        const r = await this.reminder.cancel(id, interaction.user.id);
        if (!r.ok) {
            const messages = {
                not_found: '❌ Rappel introuvable',
                not_owner: '❌ Ce rappel n\'est pas à vous'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: '✅ Rappel annulé', ephemeral: true });

     executeRemindSet(interaction) {
        const duration = interaction.options.getString('duration');
        const message = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel');
        const ms = this._parseDuration(duration);
        if (!ms) return interaction.reply({ content: '❌ Durée invalide (ex: 30m, 2h, 1d)', ephemeral: true });
        if (ms < 30_000) return interaction.reply({ content: '❌ Durée min 30 secondes', ephemeral: true });
        const fireAt = Date.now() + ms;
        const r = await this.reminder.createReminder({
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            channelId: channel?.id || null,
            text: message,
            fireAt
        });
        if (!r.ok) {
            const messages = {
                cooldown: '❌ Attendez 5s entre deux rappels',
                fire_at_in_past: '❌ La durée doit être dans le futur',
                missing_params: '❌ Paramètres manquants'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        const target = channel ? `dans ${channel}` : 'en DM';
        return interaction.reply({ content: `✅ Rappel programmé ${target} pour <t:${Math.floor(fireAt/1000)}:R> : **${message}**`, ephemeral: true });
        const list = await this.reminder.listByUser(interaction.user.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucun rappel actif.', ephemeral: true });
        const lines = list.map(r => `• \`${r.id.slice(0, 8)}\` <t:${Math.floor(r.fireAt/1000)}:R> — ${r.reminderText.slice(0, 50)}`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('⏰ Vos rappels actifs')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
        const id = interaction.options.getString('id');
        const r = await this.reminder.cancel(id, interaction.user.id);
        if (!r.ok) {
            const messages = {
                not_found: '❌ Rappel introuvable',
                not_owner: '❌ Ce rappel n\'est pas à vous'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: '✅ Rappel annulé', ephemeral: true });

     executeRemindersList(interaction) {
        const list = await this.reminder.listByUser(interaction.user.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucun rappel actif.', ephemeral: true });
        const lines = list.map(r => `• \`${r.id.slice(0, 8)}\` <t:${Math.floor(r.fireAt/1000)}:R> — ${r.reminderText.slice(0, 50)}`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('⏰ Vos rappels actifs')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
        const id = interaction.options.getString('id');
        const r = await this.reminder.cancel(id, interaction.user.id);
        if (!r.ok) {
            const messages = {
                not_found: '❌ Rappel introuvable',
                not_owner: '❌ Ce rappel n\'est pas à vous'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: '✅ Rappel annulé', ephemeral: true });

     executeReminderCancel(interaction) {
        const id = interaction.options.getString('id');
        const r = await this.reminder.cancel(id, interaction.user.id);
        if (!r.ok) {
            const messages = {
                not_found: '❌ Rappel introuvable',
                not_owner: '❌ Ce rappel n\'est pas à vous'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: '✅ Rappel annulé', ephemeral: true });

}

const remindBuilder = new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Programmer et gérer des rappels')
    .addSubcommand(sub =>
        sub.setName('set')
            .setDescription('Programmer un nouveau rappel')
            .addStringOption(o => o.setName('duration').setDescription('Durée (ex: 30m, 2h, 1d)').setRequired(true).setMaxLength(10))
            .addStringOption(o => o.setName('message').setDescription('Message du rappel').setRequired(true).setMaxLength(500))
            .addChannelOption(o => o.setName('channel').setDescription('Salon d\'envoi (sinon DM)').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Voir vos rappels actifs')
    )
    .addSubcommand(sub =>
        sub.setName('cancel')
            .setDescription('Annuler un rappel')
            .addStringOption(o => o.setName('id').setDescription('ID du rappel (8 premiers caractères)').setRequired(true).setMaxLength(8))
    );

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
