/**
 * src/modules/util_autofeeds/services/autofeeds-digest.service.js
 *
 * Service de gestion des Digests périodiques (Journal du matin / Gazette IA du serveur).
 * Regroupe les articles découverts et produit un bulletin synthétique périodique.
 */

const { EmbedBuilder } = require('discord.js');

class AutofeedsDigestService {
    constructor(repository, aiService = null) {
        this.repository = repository;
        this.aiService = aiService;
        /** @type {Map<string, object[]>} feedId -> items accumulés */
        this.pendingItems = new Map();
    }

    /**
     * Accumule un nouvel article dans la file d'attente du digest pour ce flux.
     * @param {string} feedId
     * @param {object} item
     */
    accumulateItem(feedId, item) {
        const queue = this.pendingItems.get(feedId) || [];
        // Éviter les doublons dans la file d'attente
        if (!queue.some(i => (i.id || i.guid || i.link) === (item.id || item.guid || item.link))) {
            queue.push(item);
            this.pendingItems.set(feedId, queue);
        }
    }

    getPendingCount(feedId) {
        return (this.pendingItems.get(feedId) || []).length;
    }

    /**
     * Récupère les items en attente pour un flux.
     * @param {string} feedId
     * @returns {object[]}
     */
    getPendingItems(feedId) {
        return this.pendingItems.get(feedId) || [];
    }

    /**
     * Vide la file d'attente pour un flux.
     * @param {string} feedId
     */
    clearPending(feedId) {
        this.clearPendingItems(feedId);
    }

    clearPendingItems(feedId) {
        this.pendingItems.delete(feedId);
    }

    /**
     * Génère l'Embed Discord récapitulatif du Digest avec synthèse IA optionnelle.
     * @param {object} feed
     * @param {object[]} items
     * @param {string} [customOverview]
     * @returns {Promise<EmbedBuilder>}
     */
    async generateDigestEmbed(feed, items = [], customOverview = null) {
        const embed = new EmbedBuilder()
            .setColor(feed.color || '#5865F2')
            .setTitle(`📰 Gazette & Digest : ${feed.name || 'Actualités'}`)
            .setDescription(customOverview || `Voici le récapitulatif des **${items.length}** dernières publications pour **${feed.name || 'ce flux'}**.`)
            .setTimestamp();

        // Synthèse IA si le service IA est actif et pas d'overview personnalisé fourni
        if (this.aiService && items.length > 0 && !customOverview) {
            try {
                const textToSummarize = items.slice(0, 5).map(i => `- ${i.title} : ${i.contentSnippet || i.content || ''}`).join('\n');
                const aiPrompt = `Tu es le rédacteur en chef d'un serveur Discord. Fais un résumé synthétique très clair et accrocheur en français (2-3 phrases) de ces actualités pour le journal du serveur:\n${textToSummarize}`;
                const summary = await this.aiService.callOpenRouter(aiPrompt);
                if (summary) {
                    embed.addFields({
                        name: '🤖 La Synthèse de la Rédaction (IA)',
                        value: summary.slice(0, 1024),
                        inline: false
                    });
                }
            } catch {
                // Pas bloquant si l'IA échoue
            }
        }

        // Publications sous forme de champs distincts
        const itemsToDisplay = items.slice(0, 10);
        for (const [idx, item] of itemsToDisplay.entries()) {
            const title = item.title || 'Publication sans titre';
            const link = item.link || item.url || '';
            const dateStr = item.pubDate ? ` *(<t:${Math.floor(new Date(item.pubDate).getTime() / 1000)}:R>)*` : '';
            embed.addFields({
                name: `${idx + 1}. ${title.slice(0, 250)}`,
                value: link ? `[Consulter la source](${link})${dateStr}` : `Publication${dateStr}`,
                inline: false
            });
        }

        if (items.length > 10) {
            embed.setFooter({ text: `+ ${items.length - 10} autre(s) article(s) condensé(s)` });
        }

        return embed;
    }

    /**
     * Publie le digest dans le salon Discord configuré.
     * @param {object} feed
     * @param {object} client
     * @returns {Promise<boolean>}
     */
    async dispatchDigest(feed, client) {
        const items = this.getPendingItems(feed.id);
        if (!items || items.length === 0) return false;

        const targetChannelId = feed.digestChannelId || feed.channelId;
        const channel = client.channels?.cache?.get(targetChannelId) || await client.channels?.fetch?.(targetChannelId).catch(() => null);

        if (!channel || !channel.send) {
            return false;
        }

        const embed = await this.generateDigestEmbed(feed, items);
        await channel.send({ embeds: [embed] });

        // Vider la file d'attente
        this.clearPendingItems(feed.id);
        return true;
    }
}

module.exports = { AutofeedsDigestService };
