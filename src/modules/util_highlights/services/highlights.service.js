/**
 * src/modules/util_highlights/services/highlights.service.js
 *
 * Service métier pour les alertes mots-clés Highlights (Phase 14 G22).
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { HighlightsRepository } = require('./highlights.repository.js');
const logger = require('../../../utils/logger.js');

class HighlightsService {
    static inject = [HighlightsRepository];

    constructor(repo) {
        this.repo = repo;
    }

    async addKeyword(guildId, userId, keyword) {
        if (!guildId || !userId || !keyword) {
            return { ok: false, error: 'Paramètres manquants.' };
        }
        const trimmed = keyword.trim();
        if (trimmed.length < 2) {
            return { ok: false, error: 'Le mot-clé doit comporter au moins 2 caractères.' };
        }

        const userList = await this.repo.listUserKeywords(guildId, userId);
        if (userList.length >= 15) {
            return { ok: false, error: 'Limite de 15 mots-clés atteinte.' };
        }

        const item = await this.repo.addKeyword(guildId, userId, trimmed);
        return { ok: true, data: item };
    }

    async removeKeyword(guildId, userId, keyword) {
        await this.repo.removeKeyword(guildId, userId, keyword);
        return { ok: true };
    }

    async listKeywords(guildId, userId) {
        return this.repo.listUserKeywords(guildId, userId);
    }

    async checkAndNotify(message, client) {
        if (!message || !message.guild || !message.content || message.author?.bot) return;

        const guildId = message.guild.id;
        const authorId = message.author.id;
        const contentLower = message.content.toLowerCase();

        try {
            const guildHighlights = await this.repo.listGuildKeywords(guildId);
            if (guildHighlights.length === 0) return;

            // Déterminer qui doit être notifié
            const toNotify = new Map(); // userId -> matching keyword

            for (const h of guildHighlights) {
                if (h.userId === authorId) continue; // Ne pas s'auto-alerter
                if (contentLower.includes(h.keyword.toLowerCase())) {
                    if (!toNotify.has(h.userId)) {
                        toNotify.set(h.userId, h.keyword);
                    }
                }
            }

            for (const [targetUserId, keyword] of toNotify.entries()) {
                await this._sendHighlightDM(targetUserId, keyword, message, client);
            }
        } catch (err) {
            logger.warn(`Erreur Highlights checkAndNotify: ${err.message}`, 'HIGHLIGHTS');
        }
    }

    async _sendHighlightDM(userId, keyword, message, client) {
        if (!client || !client.users) return;
        try {
            const user = client.users.cache.get(userId) || await client.users.fetch(userId).catch(() => null);
            if (!user) return;

            const jumpUrl = message.url || `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const snippet = message.content.length > 500 ? message.content.slice(0, 497) + '...' : message.content;

            const embed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle(`🔔 Alerte Mot-Clé : "${keyword}"`)
                .setDescription(`Le mot-clé **"${keyword}"** a été mentionné dans <#${message.channel.id}> sur **${message.guild.name}** par <@${message.author.id}>.\n\n> ${snippet}\n\n[🔗 Voir le message en direct](${jumpUrl})`)
                .setTimestamp();

            await user.send({ embeds: [embed] }).catch(() => {
                // Les DMs peuvent être fermés
            });
        } catch (err) {
            // Ignorer silencieusement si les DMs de l'utilisateur sont fermés
        }
    }
}

Injectable()(HighlightsService);

module.exports = { HighlightsService };
