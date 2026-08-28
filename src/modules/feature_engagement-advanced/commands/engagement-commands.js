/**
 * Slash commands de la feature engagement-advanced
 *
 * /remind duration message [channel]  (user)
 * /reminders                            (user, ephemeral)
 * /reminder-cancel id                   (user, ephemeral)
 *
 * /trigger-add trigger response [match]  (admin, ManageGuild)
 * /trigger-list
 * /trigger-remove id
 *
 * /customcmd-add name response  (admin)
 * /customcmd-list
 * /customcmd-remove name
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { ReminderService } = require('../services/reminder.service.js');
const { WordTriggerService } = require('../services/word-trigger.service.js');
const { CustomCommandService } = require('../services/custom-command.service.js');

function isAdmin(interaction) {
    return interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
}

class EngagementAdvancedCommands {
    static inject = [ReminderService, WordTriggerService, CustomCommandService];

    constructor(reminder, trigger, customs) {
        this.reminder = reminder;
        this.trigger = trigger;
        this.customs = customs;
    }

    // =================== /remind ===================

    async executeRemind(interaction) {
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
    }

    async executeRemindersList(interaction) {
        const list = await this.reminder.listByUser(interaction.user.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucun rappel actif.', ephemeral: true });
        const lines = list.map(r => `• \`${r.id.slice(0, 8)}\` <t:${Math.floor(r.fireAt/1000)}:R> — ${r.reminderText.slice(0, 50)}`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('⏰ Vos rappels actifs')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeReminderCancel(interaction) {
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

    // =================== /trigger-* ===================

    async executeTriggerAdd(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const triggerText = interaction.options.getString('trigger');
        const responseText = interaction.options.getString('response');
        const matchType = interaction.options.getString('match') || 'exact';
        const r = await this.trigger.create({
            guildId: interaction.guild.id,
            triggerText,
            matchType,
            responseText,
            createdBy: interaction.user.id
        });
        if (!r.ok) {
            const messages = {
                missing_params: '❌ Paramètres manquants',
                regex_not_supported_yet: '❌ Le match type "regex" arrive bientôt',
                response_required: '❌ responseText requis'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Trigger \`${triggerText}\` créé (match: ${matchType})`, ephemeral: true });
    }

    async executeTriggerList(interaction) {
        const list = await this.trigger.list(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun trigger configuré. Utilise `/trigger-add`.', ephemeral: true });
        }
        const lines = list.slice(0, 20).map(t => `• \`${t.id.slice(0, 8)}\` **${t.triggerText}** (${t.matchType}) — coold. ${t.cooldownSeconds}s`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎯 Triggers de mots')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeTriggerRemove(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        await this.trigger.delete(id);
        return interaction.reply({ content: '✅ Trigger supprimé', ephemeral: true });
    }

    // =================== /customcmd-* ===================

    async executeCustomCmdAdd(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const name = interaction.options.getString('name').toLowerCase();
        const responseText = interaction.options.getString('response');
        const r = await this.customs.create({
            guildId: interaction.guild.id,
            name,
            responseText,
            createdBy: interaction.user.id
        });
        if (!r.ok) {
            const messages = {
                name_taken: `❌ La commande !${name} existe déjà`,
                response_required: '❌ responseText requis',
                missing_params: '❌ Paramètres manquants',
                invalid_name: '❌ Nom invalide (1-32 caractères)'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Commande \`!${name}\` créée`, ephemeral: true });
    }

    async executeCustomCmdList(interaction) {
        const list = await this.customs.list(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucune commande custom. Utilise `/customcmd-add`.', ephemeral: true });
        }
        const lines = list.slice(0, 20).map(c => `• **!${c.name}** — coold. ${c.cooldownSeconds}s`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('⌨️ Commandes personnalisées')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeCustomCmdRemove(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const name = interaction.options.getString('name').toLowerCase();
        const cmd = await this.customs.find(interaction.guild.id, name);
        if (!cmd) return interaction.reply({ content: `❌ Commande !${name} introuvable`, ephemeral: true });
        await this.customs.delete(cmd.id);
        return interaction.reply({ content: `✅ Commande !${name} supprimée`, ephemeral: true });
    }

    _parseDuration(str) {
        if (!str) return null;
        const m = String(str).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase()];
        return n * mult;
    }
}

// =================== BUILDERS ===================

const remindBuilder = new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Programmer un rappel')
    .addStringOption(o => o.setName('duration').setDescription('Durée (ex: 30m, 2h, 1d)').setRequired(true).setMaxLength(10))
    .addStringOption(o => o.setName('message').setDescription('Message du rappel').setRequired(true).setMaxLength(500))
    .addChannelOption(o => o.setName('channel').setDescription('Salon d\'envoi (sinon DM)').setRequired(false));

const remindersListBuilder = new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('Voir vos rappels actifs');

const reminderCancelBuilder = new SlashCommandBuilder()
    .setName('reminder-cancel')
    .setDescription('Annuler un rappel')
    .addStringOption(o => o.setName('id').setDescription('ID du rappel (8 premiers caractères)').setRequired(true).setMaxLength(8));

const triggerAddBuilder = new SlashCommandBuilder()
    .setName('trigger-add')
    .setDescription('Ajouter un trigger de mot (admin)')
    .addStringOption(o => o.setName('trigger').setDescription('Mot-clé').setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName('response').setDescription('Réponse du bot').setRequired(true).setMaxLength(500))
    .addStringOption(o => o.setName('match').setDescription('Type de match').setRequired(false).addChoices(
        { name: 'exact', value: 'exact' },
        { name: 'contains', value: 'contains' }
    ))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const triggerListBuilder = new SlashCommandBuilder()
    .setName('trigger-list')
    .setDescription('Voir les triggers configurés');

const triggerRemoveBuilder = new SlashCommandBuilder()
    .setName('trigger-remove')
    .setDescription('Supprimer un trigger (admin)')
    .addStringOption(o => o.setName('id').setDescription('ID du trigger (8 premiers caractères)').setRequired(true).setMaxLength(8))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const customCmdAddBuilder = new SlashCommandBuilder()
    .setName('customcmd-add')
    .setDescription('Ajouter une commande personnalisée (admin)')
    .addStringOption(o => o.setName('name').setDescription('Nom de la commande (sans préfixe !)').setRequired(true).setMaxLength(32))
    .addStringOption(o => o.setName('response').setDescription('Réponse du bot').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const customCmdListBuilder = new SlashCommandBuilder()
    .setName('customcmd-list')
    .setDescription('Voir les commandes personnalisées');

const customCmdRemoveBuilder = new SlashCommandBuilder()
    .setName('customcmd-remove')
    .setDescription('Supprimer une commande personnalisée (admin)')
    .addStringOption(o => o.setName('name').setDescription('Nom de la commande').setRequired(true).setMaxLength(32))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

Command({ name: 'remind', builder: remindBuilder })(EngagementAdvancedCommands.prototype, 'executeRemind');
Command({ name: 'reminders', builder: remindersListBuilder })(EngagementAdvancedCommands.prototype, 'executeRemindersList');
Command({ name: 'reminder-cancel', builder: reminderCancelBuilder })(EngagementAdvancedCommands.prototype, 'executeReminderCancel');
Command({ name: 'trigger-add', builder: triggerAddBuilder })(EngagementAdvancedCommands.prototype, 'executeTriggerAdd');
Command({ name: 'trigger-list', builder: triggerListBuilder })(EngagementAdvancedCommands.prototype, 'executeTriggerList');
Command({ name: 'trigger-remove', builder: triggerRemoveBuilder })(EngagementAdvancedCommands.prototype, 'executeTriggerRemove');
Command({ name: 'customcmd-add', builder: customCmdAddBuilder })(EngagementAdvancedCommands.prototype, 'executeCustomCmdAdd');
Command({ name: 'customcmd-list', builder: customCmdListBuilder })(EngagementAdvancedCommands.prototype, 'executeCustomCmdList');
Command({ name: 'customcmd-remove', builder: customCmdRemoveBuilder })(EngagementAdvancedCommands.prototype, 'executeCustomCmdRemove');

module.exports = { EngagementAdvancedCommands, EngagementCommands: EngagementAdvancedCommands };
