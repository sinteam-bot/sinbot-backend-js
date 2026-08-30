/**
 * src/modules/community_starboard/services/starboard.service.js
 *
 * Service métier du module Starboard (Phase 7 G05).
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable, getConfig } = require('../../../core/index.js');
const { StarboardRepository } = require('./starboard.repository.js');
const logger = require('../../../utils/logger.js');

class StarboardService {
    static inject = [StarboardRepository];

    constructor(repo) {
        this.repo = repo;
    }

    getConfig(guildId) {
        const full = getConfig();
        const conf = full.features?.starboard || full.starboard || {};
        return {
            enabled: conf.enabled !== false,
            channel_id: conf.channel_id || null,
            threshold: conf.threshold ?? 3,
            emoji: conf.emoji || '⭐',
            self_star: conf.self_star || false,
            color: conf.color || '#FEE75C',
            ignored_channels: conf.ignored_channels || [],
            allow_nsfw: conf.allow_nsfw || false,
            ...conf
        };
    }

    async handleReactionAdd(reaction, user, client) {
        return this.processReaction(reaction, user, true, client);
    }

    async handleReactionRemove(reaction, user, client) {
        return this.processReaction(reaction, user, false, client);
    }

    async processReaction(reaction, user, isAdded, client) {
        try {
            // Fetch partials if needed
            if (reaction.partial) {
                try { await reaction.fetch(); } catch (e) { return { ok: false, reason: 'fetch_failed' }; }
            }
            if (reaction.message?.partial) {
                try { await reaction.message.fetch(); } catch (e) { return { ok: false, reason: 'message_fetch_failed' }; }
            }

            const message = reaction.message;
            if (!message || !message.guild) return { ok: false, reason: 'no_guild' };

            const guildId = message.guild.id;
            const config = this.getConfig(guildId);

            if (!config.enabled) return { ok: false, reason: 'disabled' };
            if (!config.channel_id) return { ok: false, reason: 'no_starboard_channel' };

            // Starboard channel shouldn't star itself
            if (message.channel.id === config.channel_id) return { ok: false, reason: 'is_starboard_channel' };

            // Check ignored channels
            if (config.ignored_channels && config.ignored_channels.includes(message.channel.id)) {
                return { ok: false, reason: 'ignored_channel' };
            }

            // Check NSFW if not allowed
            if (message.channel.nsfw && !config.allow_nsfw) {
                return { ok: false, reason: 'nsfw_not_allowed' };
            }

            // Check emoji match
            const emojiIdentifier = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
            const isEmojiMatch = (reaction.emoji.name === config.emoji) || (reaction.emoji.id === config.emoji) || (emojiIdentifier === config.emoji);
            if (!isEmojiMatch) return { ok: false, reason: 'emoji_mismatch' };

            // Count valid reactions
            let reactionUsers = [];
            try {
                const fetchedUsers = await reaction.users.fetch();
                reactionUsers = Array.from(fetchedUsers.values());
            } catch {
                reactionUsers = [];
            }

            // Filter self stars if self_star is false
            if (!config.self_star) {
                reactionUsers = reactionUsers.filter(u => u.id !== message.author.id);
            }

            const starCount = reactionUsers.length;
            const userIds = reactionUsers.map(u => u.id);

            const existingEntry = await this.repo.getEntry(guildId, message.id);
            const starboardChannel = client.channels.cache.get(config.channel_id) || await client.channels.fetch(config.channel_id).catch(() => null);

            if (!starboardChannel || !starboardChannel.isTextBased()) {
                return { ok: false, reason: 'invalid_starboard_channel' };
            }

            if (starCount >= config.threshold) {
                const embed = this.buildStarboardEmbed(message, starCount, config);
                const starHeader = `${config.emoji} **${starCount}** | <#${message.channel.id}>`;

                if (existingEntry && existingEntry.starboardMessageId) {
                    // Update existing message on Starboard
                    try {
                        const existingMsg = await starboardChannel.messages.fetch(existingEntry.starboardMessageId).catch(() => null);
                        if (existingMsg) {
                            await existingMsg.edit({ content: starHeader, embeds: [embed] });
                            await this.repo.saveEntry({
                                ...existingEntry,
                                reactionCount: starCount,
                                starredUsers: userIds
                            });
                            return { ok: true, action: 'updated', starCount };
                        }
                    } catch (e) {
                        logger.warn(`Impossible d'éditer le message starboard ${existingEntry.starboardMessageId}: ${e.message}`, 'STARBOARD');
                    }
                }

                // Create new Starboard message
                const sentMsg = await starboardChannel.send({ content: starHeader, embeds: [embed] });
                await this.repo.saveEntry({
                    guildId,
                    sourceChannelId: message.channel.id,
                    sourceMessageId: message.id,
                    starboardMessageId: sentMsg.id,
                    authorId: message.author.id,
                    reactionCount: starCount,
                    starredUsers: userIds
                });

                return { ok: true, action: 'created', starCount, starboardMessageId: sentMsg.id };
            } else if (existingEntry && existingEntry.starboardMessageId) {
                // If stars dropped below threshold, remove from starboard or update
                if (starCount === 0) {
                    try {
                        const existingMsg = await starboardChannel.messages.fetch(existingEntry.starboardMessageId).catch(() => null);
                        if (existingMsg) await existingMsg.delete().catch(() => null);
                    } catch { }
                    await this.repo.deleteEntry(existingEntry.id);
                    return { ok: true, action: 'deleted', starCount };
                } else {
                    const embed = this.buildStarboardEmbed(message, starCount, config);
                    const starHeader = `${config.emoji} **${starCount}** | <#${message.channel.id}>`;
                    const existingMsg = await starboardChannel.messages.fetch(existingEntry.starboardMessageId).catch(() => null);
                    if (existingMsg) {
                        await existingMsg.edit({ content: starHeader, embeds: [embed] });
                    }
                    await this.repo.saveEntry({
                        ...existingEntry,
                        reactionCount: starCount,
                        starredUsers: userIds
                    });
                    return { ok: true, action: 'updated_below_threshold', starCount };
                }
            }

            return { ok: true, starCount, threshold: config.threshold };
        } catch (error) {
            logger.error(`Erreur processReaction Starboard: ${error.message}`, 'STARBOARD');
            return { ok: false, error: error.message };
        }
    }

    buildStarboardEmbed(message, starCount, config) {
        const colorHex = parseInt(String(config.color || '#FEE75C').replace('#', ''), 16) || 0xFEE75C;

        const embed = new EmbedBuilder()
            .setColor(colorHex)
            .setAuthor({
                name: message.author.tag || message.author.username,
                iconURL: message.author.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true }) : undefined
            })
            .setTimestamp(message.createdAt || new Date());

        let description = message.content || '';
        if (description.length > 2000) {
            description = description.slice(0, 1997) + '...';
        }
        description += `\n\n[**Aller au message original**](${message.url})`;
        embed.setDescription(description);

        // Check attachments for images
        if (message.attachments && message.attachments.size > 0) {
            const firstAttachment = Array.from(message.attachments.values())[0];
            if (firstAttachment.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(firstAttachment.name || '')) {
                embed.setImage(firstAttachment.url);
            }
        }

        embed.setFooter({ text: `ID: ${message.id}` });
        return embed;
    }
}

Injectable()(StarboardService);

module.exports = { StarboardService };
