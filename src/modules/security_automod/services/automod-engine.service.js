/**
 * AutomodEngine — orchestrateur des règles d'automod (Phases 1-6 & Phase 11)
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
        this._attachmentHistory = new Map(); // key: `${guildId}:${userId}`, value: [{ timestamp, count }]
    }

    _trackAttachments(guildId, userId, count, config) {
        if (count <= 0) return false;
        const key = `${guildId}:${userId}`;
        const now = Date.now();
        const windowMs = (config.window_seconds || 10) * 1000;
        const max = config.max_attachments || 3;

        let history = this._attachmentHistory.get(key) || [];
        history = history.filter(item => now - item.timestamp < windowMs);
        history.push({ timestamp: now, count });
        this._attachmentHistory.set(key, history);

        const totalInWindow = history.reduce((sum, item) => sum + item.count, 0);
        return totalInWindow > max;
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
        const channelId = message.channelId || message.channel?.id;

        // 1. Règles par salon (G38 Auto Delete avancé par salon)
        if (config.channel_rules && channelId) {
            const chanRule = config.channel_rules[channelId] || (message.channel?.name ? config.channel_rules[message.channel.name] : null);
            if (chanRule) {
                if (chanRule.media_only) {
                    const hasAttachment = message.attachments && message.attachments.size > 0;
                    const hasMediaUrl = /(https?:\/\/[^\s]+(?:\.png|\.jpg|\.jpeg|\.gif|\.webp|\.mp4|\.mov))/i.test(message.content || '');
                    if (!hasAttachment && !hasMediaUrl) {
                        actions.push('channel_rule:media_only');
                        await message.delete().catch(() => {});
                        return { acted: true, actions };
                    }
                }

                if (chanRule.no_media) {
                    if (message.attachments && message.attachments.size > 0) {
                        actions.push('channel_rule:no_media');
                        await message.delete().catch(() => {});
                        return { acted: true, actions };
                    }
                }

                if (chanRule.regex_whitelist) {
                    try {
                        const re = new RegExp(chanRule.regex_whitelist, 'i');
                        if (!re.test(message.content || '')) {
                            actions.push('channel_rule:regex_whitelist');
                            await message.delete().catch(() => {});
                            return { acted: true, actions };
                        }
                    } catch (_) {}
                }

                if (chanRule.regex_blacklist) {
                    try {
                        const re = new RegExp(chanRule.regex_blacklist, 'i');
                        if (re.test(message.content || '')) {
                            actions.push('channel_rule:regex_blacklist');
                            await message.delete().catch(() => {});
                            return { acted: true, actions };
                        }
                    } catch (_) {}
                }

                if (chanRule.auto_purge_seconds && chanRule.auto_purge_seconds > 0) {
                    setTimeout(() => {
                        message.delete().catch(() => {});
                    }, chanRule.auto_purge_seconds * 1000);
                }
            }
        }

        // 2. Anti-Sticker (G37)
        if (config.anti_sticker?.enabled && message.stickers && message.stickers.size > 0) {
            actions.push('anti_sticker');
            await this._applyAction(message, config.anti_sticker.action || 'delete', {
                rule: 'anti_sticker',
                reason: 'Stickers non autorisés'
            });
            return { acted: true, actions };
        }

        // 3. Anti-Attachment Spam (G16)
        if (config.anti_attachment_spam?.enabled && message.attachments && message.attachments.size > 0) {
            const count = message.attachments.size;
            const maxPerMsg = config.anti_attachment_spam.max_per_message || 5;

            if (count > maxPerMsg) {
                actions.push('anti_attachment_spam:max_per_message');
                await this._applyAction(message, config.anti_attachment_spam.action || 'delete_warn', {
                    rule: 'anti_attachment_spam',
                    reason: `Trop de pièces jointes (${count} fichiers)`
                });
                return { acted: true, actions };
            }

            const isSpamming = this._trackAttachments(guild.id, userId, count, config.anti_attachment_spam);
            if (isSpamming) {
                actions.push('anti_attachment_spam:rate_limit');
                await this._applyAction(message, config.anti_attachment_spam.action || 'delete_warn', {
                    rule: 'anti_attachment_spam',
                    reason: `Spam de fichiers joints détecté`
                });
                return { acted: true, actions };
            }
        }

        // 4. Anti-Zalgo (G36)
        if (config.anti_zalgo?.enabled) {
            const zalgoMatches = (message.content || '').match(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g);
            const zalgoCount = zalgoMatches ? zalgoMatches.length : 0;
            const maxZalgo = config.anti_zalgo.max_zalgo_chars || 3;

            if (zalgoCount >= maxZalgo) {
                actions.push('anti_zalgo');
                await this._applyAction(message, config.anti_zalgo.action || 'delete_warn', {
                    rule: 'anti_zalgo',
                    reason: `Texte corrompu/zalgo détecté (${zalgoCount} caractères spéciaux)`
                });
                return { acted: true, actions };
            }
        }

        // 5. Spam Détection
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

        // 6. Mass Mention
        if (config.mass_mention?.enabled && message.mentions?.users?.size >= config.mass_mention.threshold) {
            actions.push('mass_mention');
            await this._applyAction(message, config.mass_mention.action, {
                rule: 'mass_mention',
                reason: `Mention de masse (${message.mentions.users.size} personnes)`
            });
        }

        // 7. Badwords
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

        // 8. Anti-Invite
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

        // 9. Anti-Caps
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
                await message.delete().catch(err => {
                    console.warn('[AutoModEngine] Impossible de supprimer le message enfreignant:', err.message);
                });
            }
            if (action === 'warn' || action === 'delete_warn') {
                await this.sanctions.warn(message.guild, message.author, message.client?.user, reason, 'automod', rule);
            } else if (action === 'mute') {
                const duration = parseDuration('1h') || 3600000;
                const member = message.member;
                if (member) {
                    await this.sanctions.mute(message.guild, member, message.client?.user, duration, reason);
                }
            } else if (action === 'kick') {
                if (message.member) {
                    await this.sanctions.kick(message.guild, message.member, message.client?.user, reason);
                }
            } else if (action === 'ban') {
                await this.sanctions.ban(message.guild, message.author, message.client?.user, reason);
            }
        } catch (err) {
            console.error(`[AutomodEngine] action ${action} failed: ${err.message}`);
        }
    }
}

module.exports = { AutomodEngine };
