/**
 * reminders/events/message-create.listener.js
 *
 * Listener pour les commandes de rappels (prefixe !remind).
 */

const { OnEvent } = require('../../../core/index.js');
const { ReminderService } = require('../services/reminder.service.js');

class RemindersMessageListener {
    static inject = [ReminderService];

    constructor(service) {
        this.service = service;
    }

    async handle(message) {
        if (!message.guild) return;
        if (message.author.bot) return;
        const content = message.content || '';
        if (!content.startsWith('!remind ')) return;

        const args = content.slice(7).trim().split(/\s+/);
        if (args.length < 2) return;

        const durationStr = args[0];
        const text = args.slice(1).join(' ');
        const durationMs = this._parseDuration(durationStr);
        if (!durationMs) {
            return message.reply('❌ Durée invalide (ex: 5m, 1h, 1d)');
        }

        const r = await this.service.createReminder({
            userId: message.author.id,
            guildId: message.guild.id,
            channelId: message.channel.id,
            text,
            fireAt: Date.now() + durationMs
        });

        if (!r.ok) {
            const msg = {
                missing_params: '❌ Paramètres manquants',
                fire_at_in_past: '❌ La date est dans le passé',
                cooldown: '⏳ Patiente 5s avant un nouveau rappel'
            }[r.error] || `❌ Erreur: ${r.error}`;
            return message.reply(msg);
        }
        return message.reply(`✅ Rappel créé ! Je te ping dans ${durationStr}`);
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

OnEvent('messageCreate', { priority: 30 })(RemindersMessageListener.prototype, 'handle');

module.exports = { RemindersMessageListener: RemindersMessageListener };
