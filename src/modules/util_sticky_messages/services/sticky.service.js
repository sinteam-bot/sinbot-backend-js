/**
 * src/modules/util_sticky_messages/services/sticky.service.js
 *
 * Service métier pour les messages persistants Sticky Messages (Phase 14 G28).
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { StickyRepository } = require('./sticky.repository.js');
const logger = require('../../../utils/logger.js');

class StickyService {
    static inject = [StickyRepository];

    constructor(repo) {
        this.repo = repo;
        this._lockMap = new Set();
    }

    async setSticky({ guildId, channelId, content, embedJson = null, cooldownMessages = 1, client = null }) {
        if (!guildId || !channelId || !content) {
            return { ok: false, error: 'Paramètres manquants.' };
        }

        const sticky = await this.repo.setSticky({
            guildId,
            channelId,
            content,
            embedJson,
            cooldownMessages: Math.max(1, parseInt(cooldownMessages, 10) || 1)
        });

        // Envoi initial
        if (client) {
            await this._repostSticky(sticky, client);
        }

        logger.info(`Sticky message configuré sur <#${channelId}>`, 'STICKY');
        return { ok: true, data: sticky };
    }

    async getSticky(guildId, channelId) {
        return this.repo.getSticky(guildId, channelId);
    }

    async listSticky(guildId) {
        return this.repo.listByGuild(guildId);
    }

    async removeSticky(guildId, channelId) {
        await this.repo.removeSticky(guildId, channelId);
        return { ok: true };
    }

    async onMessage(message, client) {
        if (!message || message.author?.bot || !message.guild) return;

        const guildId = message.guild.id;
        const channelId = message.channel.id;

        const sticky = await this.repo.getSticky(guildId, channelId);
        if (!sticky) return;

        await this.repo.incrementMessageCount(guildId, channelId);

        if (sticky.messageCountSincePost + 1 >= sticky.cooldownMessages) {
            await this._repostSticky(sticky, client);
        }
    }

    async _repostSticky(sticky, client) {
        const lockKey = `${sticky.guildId}:${sticky.channelId}`;
        if (this._lockMap.has(lockKey)) return;
        this._lockMap.add(lockKey);

        try {
            if (!client || !client.channels) return;
            const channel = client.channels.cache.get(sticky.channelId) || await client.channels.fetch(sticky.channelId).catch(() => null);
            if (!channel || !channel.send) return;

            // Supprimer l'ancien message
            if (sticky.lastMessageId && channel.messages) {
                const oldMsg = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
                if (oldMsg && oldMsg.delete) {
                    await oldMsg.delete().catch(() => {});
                }
            }

            // Construire et envoyer le nouveau
            const payload = { content: `📌 __**Information**__ :\n${sticky.content}` };
            if (sticky.embedJson) {
                try {
                    const embed = new EmbedBuilder(sticky.embedJson);
                    payload.embeds = [embed];
                } catch (_) {}
            }

            const newMsg = await channel.send(payload).catch(() => null);
            if (newMsg) {
                await this.repo.updateLastMessage(sticky.guildId, sticky.channelId, newMsg.id);
            }
        } catch (err) {
            logger.warn(`Erreur repost sticky ${sticky.channelId}: ${err.message}`, 'STICKY');
        } finally {
            this._lockMap.delete(lockKey);
        }
    }
}

Injectable()(StickyService);

module.exports = { StickyService };
