/**
 * src/modules/util_autofeeds/services/providers/google-news.provider.js
 *
 * Fournisseur Google News (actualités par sujet, mot-clé ou publication).
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class GoogleNewsFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'google_news',
            label: 'Google News',
            icon: '⚡',
            description: 'Actualités presse via Google News par mots-clés ou thématiques.'
        });

        this.rssProvider = new RssFeedProvider();
    }

    /**
     * Résout une recherche ou thématique Google News en URL RSS.
     */
    resolveUrl(input) {
        const raw = (input || '').trim();

        if (raw.startsWith('http://') || raw.startsWith('https://')) {
            return raw;
        }

        // Si requête de recherche texte (ex: "jeux video" ou "cybersecurite")
        const encoded = encodeURIComponent(raw);
        return `https://news.google.com/rss/search?q=${encoded}&hl=fr&gl=FR&ceid=FR:fr`;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);

        return rawItems.map(item => ({
            ...item,
            tags: Array.from(new Set([...(item.tags || []), 'news', 'google_news']))
        }));
    }
}

module.exports = { GoogleNewsFeedProvider };
