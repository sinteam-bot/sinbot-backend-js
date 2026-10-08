/**
 * src/modules/util_autofeeds/services/autofeeds-knowledge.service.js
 *
 * Synchronisation Wiki & Base de Connaissances (Auto-Doc / Notion / Obsidian Sync).
 * Convertit les articles en format Markdown Obsidian avec frontmatter YAML complet
 * et permet la synchronisation directe ou par webhook vers des bases de connaissances.
 */

const { ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const logger = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');
const { autofeedsRepository } = require('./autofeeds.repository.js');

class AutofeedsKnowledgeService {
    constructor(repository = autofeedsRepository) {
        this.repository = repository;
    }

    /**
     * Calcule le temps de lecture estimé en minutes.
     * @param {string} text
     * @returns {number}
     */
    estimateReadingTime(text) {
        if (!text || typeof text !== 'string') return 1;
        const words = text.trim().split(/\s+/).length;
        return Math.max(1, Math.ceil(words / 200));
    }

    /**
     * Formate un article en Markdown Obsidian avec métadonnées frontmatter YAML.
     * @param {Object} item
     * @param {Object} [feed]
     * @returns {string} Markdown complet
     */
    formatObsidianMarkdown(item, feed = {}) {
        const title = (item.title || 'Sans titre').replace(/"/g, '\\"');
        const pubDate = item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const sourceName = (feed?.name || item.feedName || 'Flux d\'actualités').replace(/"/g, '\\"');
        const sourceUrl = item.link || item.url || feed?.feedUrl || '';
        const author = (item.author || item.itemAuthor || 'Inconnu').replace(/"/g, '\\"');
        const content = item.content || item.itemContent || item.contentSnippet || item.summary || 'Aucun contenu fourni.';
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const tagsYaml = tags.length > 0 ? tags.map(t => `  - ${String(t).replace(/^#/, '')}`).join('\n') : '  - actualites';
        const readingTime = this.estimateReadingTime(content);
        const syncedAt = new Date().toISOString();

        return `---
title: "${title}"
date: ${pubDate}
source: "${sourceName}"
source_url: "${sourceUrl}"
author: "${author}"
reading_time: "${readingTime} min"
tags:
${tagsYaml}
synced_at: ${syncedAt}
---

# ${title}

> 📌 *Article archivé automatiquement depuis [${sourceName}](${sourceUrl})*

## Résumé & Points Clés
${item.extra?.aiSummary || item.summary || 'Consulter les notes ci-dessous.'}

## Contenu Intégral
${content}

---
*Fiche générée automatiquement par Chienne Bot Knowledge Sync*
`;
    }

    /**
     * Envoie l'article vers un webhook externe (Obsidian Local REST API, Make, Notion Bridge).
     * @param {Object} feed
     * @param {Object} item
     * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
     */
    async syncToKnowledgeBase(feed, item) {
        if (!feed?.syncToKnowledgeBase || !feed?.knowledgeWebhookUrl) {
            return { ok: false, error: 'Synchronisation vers la base de connaissances non activée ou webhook manquant.' };
        }

        const markdown = this.formatObsidianMarkdown(item, feed);
        const payload = {
            title: item.title,
            url: item.link || item.url,
            feedName: feed.name,
            tags: item.tags || [],
            markdown,
            timestamp: Date.now()
        };

        try {
            const res = await fetch(feed.knowledgeWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(5000)
            });

            if (!res.ok) {
                throw new Error(`Code HTTP ${res.status}`);
            }

            return { ok: true, status: res.status };
        } catch (err) {
            logger.warn(`[AutofeedsKnowledge] Échec sync webhook ${feed.knowledgeWebhookUrl}: ${err.message}`, 'AUTOFEEDS_KNOWLEDGE');
            return { ok: false, error: err.message };
        }
    }

    /**
     * Construit le bouton Discord pour archiver dans le wiki.
     */
    createWikiButton(historyId) {
        return new ButtonBuilder()
            .setCustomId(`feed_wiki:${historyId}`)
            .setLabel('📚 Archiver Wiki')
            .setEmoji('📚')
            .setStyle(ButtonStyle.Secondary);
    }

    /**
     * Construit un embed de confirmation d'archivage ou d'export.
     */
    buildWikiExportEmbed(item, feed, isWebhookSent = false) {
        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle(`📚 Fiche Wiki & Base de Connaissances : ${item.title?.slice(0, 200)}`)
            .setDescription(isWebhookSent
                ? '✅ **Synchronisation réussie !** L\'article a été poussé vers votre coffre Obsidian / Notion.'
                : '📋 **Format Obsidian Markdown généré.** Vous pouvez copier le bloc ci-dessous ou le télécharger :')
            .addFields(
                { name: '🏷️ Tags', value: (item.tags || []).map(t => `\`#${t}\``).join(' ') || '`#news`', inline: true },
                { name: '⏱️ Temps de lecture', value: `\`${this.estimateReadingTime(item.content || item.summary)} min\``, inline: true }
            )
            .setFooter({ text: 'Knowledge Sync • Chienne Bot' })
            .setTimestamp();

        return embed;
    }
}

const autofeedsKnowledgeService = new AutofeedsKnowledgeService();
Injectable()(AutofeedsKnowledgeService);

module.exports = {
    AutofeedsKnowledgeService,
    autofeedsKnowledgeService
};
