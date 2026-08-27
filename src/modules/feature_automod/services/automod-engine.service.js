/**
 * AutomodEngine — orchestrateur des règles d'automod
 *
 * Reçoit un message Discord, applique les règles activées et délègue
 * les actions au service Sanctions.
 */

const { SpamDetector } = require('./spam-detector.service.js');
const { BadWords } = require('./bad-words.service.js');
const { Sanctions, parseDuration } = require('./sanctions.service.js');

class AutomodEngine {
    constructor() {
        this.spamDetector = new SpamDetector();
        this.badWords = new BadWords();
        this.sanctions = new Sanctions();
    }

    /**
     * Vérifie un message et applique les actions nécessaires
     * @param {import('discord.js').Message} message
     * @param {object} config  configuration résolue pour ce guild
     * @returns {Promise<{ acted: boolean, actions: string[] }>}
     */
    async processMessage(message, config) {
        if (!config || !message || !message.guild || message.author?.bot) {
            return { acted: false, actions: [] };
        }

        const actions = [];
        const guild = message.guild;
        const userId = message.author.id;

        if (config.spam?.enabled) {
            const r = this.spamDetector.checkMessage(
                guild.id, userId,
                { content: message.content, mentions: { users: { size: message.mentions?.users?.size || 0 } } },
                config.spam
            );
            if (r.spam) {
                actions.push(`spam:${r.reason}`);
                await this._applyAction(message, config.spam.action || 'warn', {
                    rule: 'spam',
                    reason: `Spam détecté (${r.reason}, ${r.count})`
                });
            }
        }

        if (config.mass_mention?.enabled && message.mentions?.users?.size >= config.mass_mention.threshold) {
            actions.push('mass_mention');
            await this._applyAction(message, config.mass_mention.action, {
                rule: 'mass_mention',
                reason: `Mention de masse (${message.mentions.users.size} personnes)`
            });
        }

        if (config.badwords?.enabled && this.badWords.isEnabled(config.badwords)) {
            const r = this.badWords.check(message.content || '', config.badwords);
            if (r.matched) {
                actions.push('badwords');
                await this._applyAction(message, config.badwords.action, {
                    rule: 'badwords',
                    reason: `Mot interdit détecté`
                });
            }
        }

        if (config.anti_invite?.enabled) {
            const inviteRe = /(discord\.gg\/[\w-]+|discord\.com\/invite\/[\w-]+|discordapp\.com\/invite\/[\w-]+)/i;
            if (inviteRe.test(message.content || '')) {
                actions.push('anti_invite');
                await this._applyAction(message, config.anti_invite.action, {
                    rule: 'anti_invite',
                    reason: 'Lien d\'invitation Discord'
                });
            }
        }

        if (config.anti_caps?.enabled) {
            const text = (message.content || '').replace(/[^a-zA-Z]/g, '');
            if (text.length >= config.anti_caps.min_length) {
                const upper = text.replace(/[^A-Z]/g, '').length;
                const ratio = upper / text.length;
                if (ratio >= config.anti_caps.caps_ratio) {
                    actions.push('anti_caps');
                    await this._applyAction(message, config.anti_caps.action, {
                        rule: 'anti_caps',
                        reason: `Trop de majuscules (${Math.round(ratio * 100)}%)`
                    });
                }
            }
        }

        return { acted: actions.length > 0, actions };
    }

    async _applyAction(message, action, { rule, reason }) {
        const config = { rule, reason };
        try {
            if (action === 'delete' || action === 'delete_warn') {
                await message.delete().catch(() => {});
            }
            if (action === 'warn' || action === 'delete_warn') {
                await this.sanctions.warn(message.guild, message.author, message.client.user, reason, 'automod', rule);
            } else if (action === 'mute') {
                const duration = parseDuration('1h') || 3600000;
                const member = message.member;
                if (member) {
                    await this.sanctions.mute(message.guild, member, message.client.user, duration, reason);
                }
            } else if (action === 'kick') {
                if (message.member) {
                    await this.sanctions.kick(message.guild, message.member, message.client.user, reason);
                }
            } else if (action === 'ban') {
                await this.sanctions.ban(message.guild, message.author, message.client.user, reason);
            }
        } catch (err) {
            console.error(`[AutomodEngine] action ${action} failed: ${err.message}`);
        }
    }
}

module.exports = { AutomodEngine };
