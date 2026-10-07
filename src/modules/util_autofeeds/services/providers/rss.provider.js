/**
 * src/modules/util_autofeeds/services/providers/rss.provider.js
 *
 * Fournisseur RSS / Atom standard universel (LootScraper, blogs, presse, podcasts).
 */

const Parser = require('rss-parser');
const { BaseFeedProvider } = require('./base.provider.js');

class RssFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'rss',
            label: 'Flux RSS & Atom',
            icon: '📰',
            description: 'Supporte tous les flux RSS 2.0, Atom et XML standards.'
        });

        this.parser = new Parser({
            timeout: 10000,
            headers: {
                'User-Agent': 'DiscordBot-FeedFetcher/2.0 (+https://github.com/chienne-bot)'
            },
            customFields: {
                item: [
                    ['media:content', 'mediaContent', { keepArray: true }],
                    ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
                    ['content:encoded', 'contentEncoded'],
                    ['dc:creator', 'creator']
                ]
            }
        });
    }

    /**
     * Extrait une URL d'image valide depuis un item (enclosure, media:content ou <img>).
     */
    extractImageUrl(item) {
        // 1. Enclosure de type image
        if (item.enclosure?.url && item.enclosure.type?.startsWith('image')) {
            return item.enclosure.url;
        }

        // 2. media:content
        if (item.mediaContent) {
            const arr = Array.isArray(item.mediaContent) ? item.mediaContent : [item.mediaContent];
            const img = arr.find(m => m?.$?.url || m?.url);
            if (img) return img.$?.url || img.url;
        }

        // 3. media:thumbnail
        if (item.mediaThumbnail) {
            const arr = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail : [item.mediaThumbnail];
            const thumb = arr.find(m => m?.$?.url || m?.url);
            if (thumb) return thumb.$?.url || thumb.url;
        }

        // 4. Balise <img src="..."> dans le contenu HTML
        const html = item.contentEncoded || item.content || item.description || '';
        const imgMatch = html.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
        if (imgMatch) {
            return imgMatch[1];
        }

        return null;
    }

    /**
     * Normalise un item extrait via RSS-Parser en format unifié FeedItem.
     */
    normalizeParsedItem(raw, feed) {
        const title = (raw.title || 'Sans titre').trim();
        const link = (raw.link || feed.feedUrl || '').trim();
        const id = raw.guid || raw.id || link;
        const publishedAt = raw.isoDate ? Date.parse(raw.isoDate) : (raw.pubDate ? Date.parse(raw.pubDate) : Date.now());

        const rawContent = raw.contentSnippet || raw.summary || raw.content || raw.description || '';
        const content = this.cleanHtml(rawContent).slice(0, 500);

        const author = raw.creator || raw.author || raw['dc:creator'] || null;
        const imageUrl = this.extractImageUrl(raw);

        // Tags extraits depuis le flux lui-même
        let itemTags = [];
        if (Array.isArray(raw.categories)) {
            itemTags = raw.categories
                .map(c => typeof c === 'string' ? c.trim().toLowerCase() : (c?._ || '').trim().toLowerCase())
                .filter(Boolean);
        }

        return {
            id,
            title,
            link,
            content,
            author,
            publishedAt: isNaN(publishedAt) ? Date.now() : publishedAt,
            imageUrl,
            tags: itemTags,
            extra: {
                guid: raw.guid || null
            }
        };
    }

    /**
     * Analyseur d'appoint en regex si rss-parser échoue ou pour les tests unitaires purs.
     */
    parseXmlFallback(xml, feedUrl = '') {
        if (!xml || typeof xml !== 'string') return [];
        const items = [];

        // Match RSS <item>
        const itemRegex = /<item[\s\S]*?<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(xml)) !== null) {
            const block = match[0];
            const titleM = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
            const linkM = block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
            const guidM = block.match(/<guid[\s\S]*?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/i);
            const pubDateM = block.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i);
            const descM = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

            const title = titleM ? titleM[1].trim() : 'Sans titre';
            const link = linkM ? linkM[1].trim() : feedUrl;
            const id = guidM ? guidM[1].trim() : link;
            const publishedAt = pubDateM ? Date.parse(pubDateM[1]) || Date.now() : Date.now();
            const content = descM ? this.cleanHtml(descM[1]).slice(0, 500) : '';

            // Extraire tags <category>
            const catMatches = block.matchAll(/<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi);
            const tags = [];
            for (const cm of catMatches) {
                if (cm[1]) tags.push(cm[1].trim().toLowerCase());
            }

            items.push({
                id,
                title,
                link,
                content,
                author: null,
                publishedAt,
                imageUrl: null,
                tags
            });
        }

        // Si aucun item, tenter Atom <entry>
        if (items.length === 0) {
            const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
            while ((match = entryRegex.exec(xml)) !== null) {
                const block = match[0];
                const titleM = block.match(/<title[\s\S]*?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
                const linkM = block.match(/<link[\s\S]*?href=["']([\s\S]*?)["']/i);
                const idM = block.match(/<id>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/id>/i);
                const updatedM = block.match(/<updated>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/updated>/i);
                const sumM = block.match(/<summary[\s\S]*?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);

                const title = titleM ? titleM[1].trim() : 'Sans titre';
                const link = linkM ? linkM[1].trim() : feedUrl;
                const id = idM ? idM[1].trim() : link;
                const publishedAt = updatedM ? Date.parse(updatedM[1]) || Date.now() : Date.now();
                const content = sumM ? this.cleanHtml(sumM[1]).slice(0, 500) : '';

                items.push({
                    id,
                    title,
                    link,
                    content,
                    author: null,
                    publishedAt,
                    imageUrl: null,
                    tags: []
                });
            }
        }

        return items;
    }

    async fetchItems(feed) {
        const feedUrl = feed.feedUrl || feed.feed_url;
        if (!feedUrl) return [];

        try {
            const parsed = await this.parser.parseURL(feedUrl);
            const items = (parsed.items || []).map(it => this.normalizeParsedItem(it, feed));
            return items;
        } catch {
            // Si rss-parser échoue (ex: flux avec certificat custom ou format atypique), fallback via fetch + regex
            try {
                const res = await fetch(feedUrl, {
                    headers: { 'User-Agent': 'DiscordBot-FeedFetcher/2.0' }
                });
                if (!res.ok) return [];
                const xml = await res.text();
                return this.parseXmlFallback(xml, feedUrl);
            } catch {
                return [];
            }
        }
    }
}

module.exports = { RssFeedProvider };
