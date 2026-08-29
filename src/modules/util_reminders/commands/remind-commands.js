/**
 * reminders/commands/remind-commands.js
 *
 * Commandes slash pour la feature reminders.
 *
 * Issue du split de game_engagement-advanced/ (Phase 9.2 du plan
 * migrate-to-c12). Avant : logique mélangée reminders+triggers+customcmd.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { ReminderService } = require('../services/reminder.service.js');

class RemindersCommands {
    static inject = [ReminderService];
    constructor(service) { this.service = service; }

    async executeRemindMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'set':    return this._executeRemindSet(interaction);
            case 'list':   return this._executeRemindersList(interaction);
            case 'cancel': return this._executeReminderCancel(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }

    async _executeRemindSet(interaction) {
        const duration = interaction.options.getString('duration');
        const message = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel');
        const ms = this._parseDuration(duration);
        if (!ms) return interaction.reply({ content: '❌ Durée invalide (ex: 30m, 2h, 1d)', ephemeral: true });
        if (ms < 30_000) return interaction.reply({ content: '❌ Durée min 30 secondes', ephemeral: true });
        const fireAt = Date.now() + ms;
        const r = await this.service.createReminder({
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

    async _executeRemindersList(interaction) {
        const list = await this.service.listByUser(interaction.user.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucun rappel actif.', ephemeral: true });
        const lines = list.map(r => `• \`${r.id.slice(0, 8)}\` <t:${Math.floor(r.fireAt/1000)}:R> — ${r.reminderText.slice(0, 50)}`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('⏰ Vos rappels actifs')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async _executeReminderCancel(interaction) {
        const id = interaction.options.getString('id');
        const r = await this.service.cancel(id, interaction.user.id);
        if (!r.ok) {
            const messages = {
                not_found: '❌ Rappel introuvable',
                not_owner: '❌ Ce rappel n\'est pas à vous'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: '✅ Rappel annulé', ephemeral: true });
    }

    _parseDuration(str) {
        const m = String(str || '').match(/^(\d+)\s*([smhd])$/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
        return n * mult;
    }
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

Command({ name: 'remind', builder: remindBuilder })(RemindersCommands.prototype, 'executeRemindMain');

module.exports = { RemindersCommands };
