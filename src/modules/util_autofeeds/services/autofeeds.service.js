/**
 * src/modules/util_autofeeds/services/autofeeds.service.js
 *
 * Service métier pour les flux automatiques RSS/Atom (Phase 14 G23).
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { AutofeedsRepository } = require('./autofeeds.repository.js');
const logger = require('../../../utils/logger.js');

class AutofeedsService {
    static inject = [AutofeedsRepository];

    constructor(repo) {
        this.repo = repo;
        this._intervalTimer = null;
    }

    async addFeed({ guildId, channelId, feedUrl, intervalMinutes = 15 }) {
        if (!guildId || !channelId || !feedUrl) {
            return { ok: false, error: 'Paramètres manquants (salon, URL du flux).' };
        }

        try {
            new URL(feedUrl);
        } catch {
            return { ok: false, error: 'URL de flux invalide.' };
        }

        const feed = await this.repo.addFeed({
            guildId,
            channelId,
            feedUrl,
            intervalMinutes: Math.max(5, parseInt(intervalMinutes, 10) || 15)
        });

        logger.info(`Autofeed ${feed.id} ajouté pour ${feedUrl}`, 'AUTOFEEDS');
        return { ok: true, data: feed };
    }

    async listFeeds(guildId) {
        return this.repo.listByGuild(guildId);
    }

    async deleteFeed(id) {
        await this.repo.deleteFeed(id);
        return { ok: true };
    }

    parseFeedXml(xml) {
        if (!xml || typeof xml !== 'string') return [];
        const items = [];

        // Match RSS <item>
        const itemRegex = /<item[\s\S]*?<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(xml)) !== null) {
            const block = match[0];
            const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
            const linkMatch = block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
            const guidMatch = block.match(/<guid[\s\S]*?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/i);
            const pubDateMatch = block.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i);

            const title = titleMatch ? titleMatch[1].trim() : 'Sans titre';
            const link = linkMatch ? linkMatch[1].trim() : '';
            const id = guidMatch ? guidMatch[1].trim() : link;
            const publishedAt = pubDateMatch ? Date.parse(pubDateMatch[1]) || Date.now() : Date.now();

            items.push({ id, title, link, publishedAt });
        }

        // Si aucun item RSS, tenter Atom <entry>
        if (items.length === 0) {
            const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
            while ((match = entryRegex.exec(xml)) !== null) {
                const block = match[0];
                const titleMatch = block.match(/<title[\s\S]*?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
                const linkMatch = block.match(/<link[\s\S]*?href=["']([\s\S]*?)["']/i);
                const idMatch = block.match(/<id>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/id>/i);
                const updatedMatch = block.match(/<updated>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/updated>/i);

                const title = titleMatch ? titleMatch[1].trim() : 'Sans titre';
                const link = linkMatch ? linkMatch[1].trim() : '';
                const id = idMatch ? idMatch[1].trim() : link;
                const publishedAt = updatedMatch ? Date.parse(updatedMatch[1]) || Date.now() : Date.now();

                items.push({ id, title, link, publishedAt });
            }
        }

        return items;
    }

    async pollFeeds(client) {
        try {
            const feeds = await this.repo.listAllActive();
            for (const feed of feeds) {
                await this._checkSingleFeed(feed, client);
            }
        } catch (err) {
            logger.warn(`Erreur pollFeeds: ${err.message}`, 'AUTOFEEDS');
        }
    }

    async _checkSingleFeed(feed, client) {
        try {
            const res = await fetch(feed.feedUrl).catch(() => null);
            if (!res || !res.ok) return;
            const xml = await res.text();
            const items = this.parseFeedXml(xml);
            if (items.length === 0) return;

            // Trier du plus ancien au plus récent parmi les nouveaux
            const newItems = items
                .filter(it => it.publishedAt > feed.lastItemPublishedAt && it.id !== feed.lastItemId)
                .sort((a, b) => a.publishedAt - b.publishedAt);

            if (newItems.length === 0) return;

            // Prendre le plus récent pour maj BDD
            const latest = newItems[newItems.length - 1];

            // Poster sur Discord (max 3 pour éviter le flood au premier lancement)
            const toPost = newItems.slice(-3);
            if (client && client.channels) {
                const channel = client.channels.cache.get(feed.channelId) || await client.channels.fetch(feed.channelId).catch(() => null);
                if (channel && channel.send) {
                    for (const item of toPost) {
                        const embed = new EmbedBuilder()
                            .setColor(0xFF4500)
                            .setTitle(`📰 ${item.title.slice(0, 250)}`)
                            .setURL(item.link || feed.feedUrl)
                            .setDescription(`Nouvel article publié sur le flux [${feed.feedUrl}](${feed.feedUrl})`)
                            .setTimestamp(new Date(item.publishedAt));

                        await channel.send({ embeds: [embed] }).catch(() => {});
                    }
                }
            }

            await this.repo.updateLastItem(feed.id, latest.id, latest.publishedAt);
        } catch (err) {
            logger.warn(`Erreur check feed ${feed.id}: ${err.message}`, 'AUTOFEEDS');
        }
    }

    start(client) {
        if (this._intervalTimer) return;
        this._intervalTimer = setInterval(() => {
            this.pollFeeds(client).catch(() => {});
        }, 10 * 60 * 1000); // Poll toutes les 10 minutes
    }

    stop() {
        if (this._intervalTimer) {
            clearInterval(this._intervalTimer);
            this._intervalTimer = null;
        }
    }
}

Injectable()(AutofeedsService);

module.exports = { AutofeedsService };
