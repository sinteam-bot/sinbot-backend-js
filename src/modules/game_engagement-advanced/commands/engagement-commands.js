/**
 * Slash commands de la feature engagement-advanced avec sous-commandes
 *
 * /remind    (set|list|cancel)
 * /trigger   (add|list|remove)
 * /customcmd (add|list|remove)
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
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

    async executeRemindMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'set':    return this.executeRemindSet(interaction);
            case 'list':   return this.executeRemindersList(interaction);
            case 'cancel': return this.executeReminderCancel(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }

    async executeRemindSet(interaction) {
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

    // =================== /trigger ===================

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
    }

    async executeTriggerList(interaction) {
        const list = await this.trigger.list(interaction.guild.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucun trigger configuré.', ephemeral: true });
        const lines = list.map(t => `• \`${t.id.slice(0, 8)}\` [${t.matchType}] \`${t.triggerText}\` → *${t.responseText.slice(0, 50)}*`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎯 Triggers configurés')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeTriggerRemove(interaction) {
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

    // =================== /customcmd ===================

    async executeCustomCmdMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeCustomCmdAdd(interaction);
            case 'list':   return this.executeCustomCmdList(interaction);
            case 'remove': return this.executeCustomCmdRemove(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }

    async executeCustomCmdAdd(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const name = interaction.options.getString('name').toLowerCase().replace(/^!+/, '');
        const responseText = interaction.options.getString('response');
        const r = await this.customs.create({
            guildId: interaction.guild.id,
            name,
            responseText,
            createdBy: interaction.user.id
        });
        if (!r.ok) {
            const messages = {
                already_exists: '❌ Une commande avec ce nom existe déjà',
                invalid_name: '❌ Nom de commande invalide (lettres, chiffres, tirets uniquement)',
                missing_params: '❌ Paramètres manquants'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Commande !${name} créée`, ephemeral: true });
    }

    async executeCustomCmdList(interaction) {
        const list = await this.customs.list(interaction.guild.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucune commande personnalisée.', ephemeral: true });
        const lines = list.map(c => `• **!${c.name}** → *${c.responseText.slice(0, 50)}* (utilisée ${c.usesCount || 0} fois)`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('💬 Commandes personnalisées')
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
Command({ name: 'trigger', builder: triggerBuilder })(EngagementAdvancedCommands.prototype, 'executeTriggerMain');
Command({ name: 'customcmd', builder: customCmdBuilder })(EngagementAdvancedCommands.prototype, 'executeCustomCmdMain');

module.exports = { EngagementAdvancedCommands, EngagementCommands: EngagementAdvancedCommands };
