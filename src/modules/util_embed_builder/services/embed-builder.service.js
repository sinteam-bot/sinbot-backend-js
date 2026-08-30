/**
 * src/modules/util_embed_builder/services/embed-builder.service.js
 *
 * Service métier pour la création, l'envoi et la modification d'embeds persistants (Phase 12 G40).
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { EmbedBuilderRepository } = require('./embed-builder.repository.js');
const logger = require('../../../utils/logger.js');

class EmbedBuilderService {
    static inject = [EmbedBuilderRepository];

    constructor(repo) {
        this.repo = repo;
    }

    buildDiscordEmbed(data) {
        const embed = new EmbedBuilder();

        if (data.title) embed.setTitle(data.title);
        if (data.description) embed.setDescription(data.description);
        if (data.color) {
            try {
                const hex = data.color.replace('#', '');
                embed.setColor(parseInt(hex, 16) || 0x5865F2);
            } catch (_) {
                embed.setColor(0x5865F2);
            }
        } else {
            embed.setColor(0x5865F2);
        }

        if (data.thumbnail) {
            try { embed.setThumbnail(data.thumbnail); } catch (_) {}
        }
        if (data.image) {
            try { embed.setImage(data.image); } catch (_) {}
        }
        if (data.footer) {
            embed.setFooter({ text: typeof data.footer === 'string' ? data.footer : (data.footer.text || '') });
        }
        if (data.author && (data.author.name || typeof data.author === 'string')) {
            embed.setAuthor({
                name: typeof data.author === 'string' ? data.author : data.author.name,
                iconURL: data.author.icon_url || data.author.iconURL,
                url: data.author.url
            });
        }

        if (Array.isArray(data.fields) && data.fields.length > 0) {
            for (const f of data.fields) {
                if (f.name && f.value) {
                    embed.addFields({ name: String(f.name), value: String(f.value), inline: Boolean(f.inline) });
                }
            }
        }

        return embed;
    }

    async postEmbed({ guildId, channelId, embedData, client }) {
        if (!guildId || !channelId || !embedData) {
            return { ok: false, error: 'Paramètres manquants' };
        }

        try {
            const embed = this.buildDiscordEmbed(embedData);
            let messageId = null;

            if (client && client.channels) {
                const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
                if (channel && channel.send) {
                    const msg = await channel.send({ embeds: [embed] });
                    messageId = msg.id;
                }
            }

            const record = await this.repo.insertEmbed({
                guildId,
                channelId,
                messageId: messageId || 'simulated_msg_' + Date.now(),
                title: embedData.title,
                description: embedData.description,
                color: embedData.color,
                fields: embedData.fields,
                footer: typeof embedData.footer === 'string' ? embedData.footer : embedData.footer?.text,
                thumbnail: embedData.thumbnail,
                image: embedData.image,
                author: embedData.author
            });

            logger.info(`Embed ${record.id} publié sur le salon ${channelId}`, 'EMBED_BUILDER');
            return { ok: true, data: record };
        } catch (err) {
            logger.error(`Erreur postEmbed: ${err.message}`, 'EMBED_BUILDER');
            return { ok: false, error: err.message };
        }
    }

    async editEmbed({ id, embedData, client }) {
        const existing = await this.repo.getEmbedById(id);
        if (!existing) {
            return { ok: false, error: `Embed #${id} introuvable.` };
        }

        try {
            const merged = { ...existing, ...embedData };
            const embed = this.buildDiscordEmbed(merged);

            if (client && client.channels && existing.channelId && existing.messageId) {
                const channel = client.channels.cache.get(existing.channelId) || await client.channels.fetch(existing.channelId).catch(() => null);
                if (channel && channel.messages) {
                    const msg = await channel.messages.fetch(existing.messageId).catch(() => null);
                    if (msg && msg.edit) {
                        await msg.edit({ embeds: [embed] });
                    }
                }
            }

            const updated = await this.repo.updateEmbed(id, {
                title: embedData.title,
                description: embedData.description,
                color: embedData.color,
                fields: embedData.fields,
                footer: typeof embedData.footer === 'string' ? embedData.footer : embedData.footer?.text,
                thumbnail: embedData.thumbnail,
                image: embedData.image,
                author: embedData.author
            });

            logger.info(`Embed ${id} mis à jour avec succès.`, 'EMBED_BUILDER');
            return { ok: true, data: updated };
        } catch (err) {
            logger.error(`Erreur editEmbed: ${err.message}`, 'EMBED_BUILDER');
            return { ok: false, error: err.message };
        }
    }

    async deleteEmbed({ id, deleteDiscordMessage = false, client = null }) {
        const existing = await this.repo.getEmbedById(id);
        if (!existing) {
            return { ok: false, error: `Embed #${id} introuvable.` };
        }

        try {
            if (deleteDiscordMessage && client && client.channels && existing.channelId && existing.messageId) {
                const channel = client.channels.cache.get(existing.channelId) || await client.channels.fetch(existing.channelId).catch(() => null);
                if (channel && channel.messages) {
                    const msg = await channel.messages.fetch(existing.messageId).catch(() => null);
                    if (msg && msg.delete) {
                        await msg.delete().catch(() => {});
                    }
                }
            }

            await this.repo.delete(id);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    async listEmbeds(guildId) {
        return this.repo.listByGuild(guildId);
    }

    async getEmbed(id) {
        return this.repo.getEmbedById(id);
    }
}

Injectable()(EmbedBuilderService);

module.exports = { EmbedBuilderService };
