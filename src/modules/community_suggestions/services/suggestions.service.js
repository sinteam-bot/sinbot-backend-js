/**
 * src/modules/community_suggestions/services/suggestions.service.js
 *
 * Service métier pour le module Suggestions (Phase 7 G12).
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable, getConfig } = require('../../../core/index.js');
const { SuggestionsRepository } = require('./suggestions.repository.js');
const logger = require('../../../utils/logger.js');

const STATUS_CONFIG = {
    pending: {
        label: '🕒 En attente',
        color: 0xFEE75C, // Yellow
        description: 'En attente de votes ou d\'examen par l\'équipe.'
    },
    approved: {
        label: '✅ Approuvée',
        color: 0x57F287, // Green
        description: 'Cette suggestion a été approuvée par l\'équipe.'
    },
    rejected: {
        label: '❌ Refusée',
        color: 0xED4245, // Red
        description: 'Cette suggestion a été refusée.'
    },
    implemented: {
        label: '🎉 Implémentée',
        color: 0x5865F2, // Blurple/Purple
        description: 'Cette suggestion a été mise en place !'
    }
};

class SuggestionsService {
    static inject = [SuggestionsRepository];

    constructor(repo) {
        this.repo = repo || new SuggestionsRepository();
    }

    getConfig(guildId) {
        const full = getConfig();
        const conf = full.features?.suggestions || full.suggestions || {};
        return {
            enabled: conf.enabled !== false,
            channel_id: conf.channel_id || null,
            approved_channel_id: conf.approved_channel_id || null,
            rejected_channel_id: conf.rejected_channel_id || null,
            auto_reactions: Array.isArray(conf.auto_reactions) ? conf.auto_reactions : ['👍', '👎'],
            dm_notification: conf.dm_notification !== false,
            anonymous_allowed: conf.anonymous_allowed || false,
            staff_roles: conf.staff_roles || [],
            ...conf
        };
    }

    async submitSuggestion(guildId, user, content, { client, isAnonymous = false } = {}) {
        const config = this.getConfig(guildId);
        if (!config.enabled) return { ok: false, error: 'Module de suggestions désactivé.' };
        if (!config.channel_id) return { ok: false, error: 'Salon de suggestions non configuré.' };
        if (!content || !content.trim()) return { ok: false, error: 'Le contenu de la suggestion ne peut pas être vide.' };

        const suggestionNumber = await this.repo.getNextSuggestionNumber(guildId);
        const suggestionData = {
            guildId,
            userId: user.id,
            suggestionNumber,
            content: content.trim(),
            status: 'pending'
        };

        let sentMessage = null;
        let targetChannel = null;

        if (client) {
            targetChannel = client.channels.cache.get(config.channel_id) || await client.channels.fetch(config.channel_id).catch(() => null);
            if (targetChannel && targetChannel.isTextBased()) {
                const embed = this.buildSuggestionEmbed({
                    ...suggestionData,
                    createdAt: Date.now()
                }, isAnonymous ? null : user);

                sentMessage = await targetChannel.send({ embeds: [embed] }).catch(err => {
                    logger.warn(`Impossible d'envoyer l'embed de suggestion: ${err.message}`, 'SUGGESTIONS');
                    return null;
                });

                if (sentMessage && config.auto_reactions) {
                    for (const emoji of config.auto_reactions) {
                        await sentMessage.react(emoji).catch(() => { });
                    }
                }
            }
        }

        const created = await this.repo.createSuggestion({
            ...suggestionData,
            channelId: targetChannel?.id || config.channel_id,
            messageId: sentMessage?.id || null
        });

        logger.info(`Nouvelle suggestion #${suggestionNumber} créée par ${user.username} sur la guilde ${guildId}`, 'SUGGESTIONS');
        return { ok: true, data: created, messageId: sentMessage?.id };
    }

    async updateStatus(guildId, identifier, status, staffUser, reason, { client } = {}) {
        const validStatuses = ['pending', 'approved', 'rejected', 'implemented'];
        if (!validStatuses.includes(status)) {
            return { ok: false, error: `Statut invalide. Valides : ${validStatuses.join(', ')}` };
        }

        let suggestion = null;
        if (typeof identifier === 'number' || /^\d+$/.test(identifier)) {
            suggestion = await this.repo.getSuggestionByNumber(guildId, parseInt(identifier, 10));
        }
        if (!suggestion) {
            suggestion = await this.repo.getSuggestion(identifier);
        }
        if (!suggestion || suggestion.guildId !== guildId) {
            return { ok: false, error: `Suggestion #${identifier} introuvable.` };
        }

        const updated = await this.repo.updateSuggestion(suggestion.id, {
            status,
            staff_id: staffUser?.id || 'admin',
            staff_reason: reason || null
        });

        const config = this.getConfig(guildId);

        // Update discord message embed
        if (client && suggestion.channelId && suggestion.messageId) {
            try {
                const channel = client.channels.cache.get(suggestion.channelId) || await client.channels.fetch(suggestion.channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const message = await channel.messages.fetch(suggestion.messageId).catch(() => null);
                    if (message) {
                        let authorUser = null;
                        try { authorUser = await client.users.fetch(suggestion.userId).catch(() => null); } catch { }
                        const newEmbed = this.buildSuggestionEmbed(updated, authorUser);
                        await message.edit({ embeds: [newEmbed] });
                    }
                }
            } catch (err) {
                logger.warn(`Impossible de mettre à jour le message Discord de la suggestion #${suggestion.suggestionNumber}: ${err.message}`, 'SUGGESTIONS');
            }
        }

        // Notify user via DM if enabled
        if (client && config.dm_notification && suggestion.userId) {
            try {
                const authorUser = await client.users.fetch(suggestion.userId).catch(() => null);
                if (authorUser && !authorUser.bot) {
                    const statusMeta = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                    const dmEmbed = new EmbedBuilder()
                        .setColor(statusMeta.color)
                        .setTitle(`Statut de votre suggestion #${suggestion.suggestionNumber}`)
                        .setDescription(`Votre suggestion a été mise à jour vers : **${statusMeta.label}**`)
                        .addFields(
                            { name: 'Suggestion', value: suggestion.content.slice(0, 1024) }
                        );
                    if (reason) {
                        dmEmbed.addFields({ name: 'Commentaire du staff', value: reason });
                    }
                    await authorUser.send({ embeds: [dmEmbed] }).catch(() => { });
                }
            } catch { }
        }

        return { ok: true, data: updated };
    }

    async handleReactionVote(reaction, user, isAdded) {
        if (user.bot) return;
        const message = reaction.message;
        if (!message || !message.guild) return;

        const guildId = message.guild.id;
        const suggestion = await this.repo.getSuggestionByMessageId(guildId, message.id);
        if (!suggestion) return;

        try {
            let upvotes = 0;
            let downvotes = 0;

            const upReaction = message.reactions.cache.get('👍');
            if (upReaction) upvotes = Math.max((upReaction.count || 1) - 1, 0); // Minus bot reaction

            const downReaction = message.reactions.cache.get('👎');
            if (downReaction) downvotes = Math.max((downReaction.count || 1) - 1, 0);

            await this.repo.updateSuggestion(suggestion.id, {
                upvotes,
                downvotes
            });
        } catch (e) {
            logger.warn(`Erreur sync votes suggestion ${suggestion.id}: ${e.message}`, 'SUGGESTIONS');
        }
    }

    buildSuggestionEmbed(suggestion, authorUser) {
        const statusMeta = STATUS_CONFIG[suggestion.status] || STATUS_CONFIG.pending;

        const embed = new EmbedBuilder()
            .setColor(statusMeta.color)
            .setTitle(`💡 Suggestion #${suggestion.suggestionNumber}`)
            .setDescription(suggestion.content)
            .addFields(
                { name: 'Statut', value: statusMeta.label, inline: true }
            );

        if (authorUser) {
            embed.setAuthor({
                name: authorUser.tag || authorUser.username,
                iconURL: authorUser.displayAvatarURL ? authorUser.displayAvatarURL({ dynamic: true }) : undefined
            });
        } else {
            embed.setAuthor({
                name: 'Membre Anonyme',
                iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png'
            });
        }

        if (suggestion.staffReason) {
            embed.addFields({ name: 'Réponse du staff', value: suggestion.staffReason, inline: false });
        }

        if (suggestion.upvotes > 0 || suggestion.downvotes > 0) {
            embed.addFields({
                name: 'Votes',
                value: `👍 ${suggestion.upvotes} | 👎 ${suggestion.downvotes}`,
                inline: true
            });
        }

        embed.setTimestamp(suggestion.createdAt ? new Date(suggestion.createdAt) : new Date());
        embed.setFooter({ text: `ID: ${suggestion.id}` });

        return embed;
    }
}

Injectable()(SuggestionsService);

module.exports = { SuggestionsService, STATUS_CONFIG };
