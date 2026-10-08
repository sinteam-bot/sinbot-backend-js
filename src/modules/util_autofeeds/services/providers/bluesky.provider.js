/**
 * src/modules/util_autofeeds/services/providers/bluesky.provider.js
 *
 * Fournisseur Bluesky (AT Protocol) utilisant les flux RSS publics officiels.
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class BlueskyFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'bluesky',
            label: 'Bluesky',
            icon: '🦋',
            description: 'Surveillance des publications d\'un compte Bluesky (AT Protocol) via flux RSS public.'
        });

        this.rssProvider = new RssFeedProvider();
    }

    /**
     * Extrait le handle ou DID d'une URL ou saisie Bluesky.
     * Exemples:
     * - "https://bsky.app/profile/jay.bsky.team" -> "jay.bsky.team"
     * - "@jay.bsky.team" -> "jay.bsky.team"
     * - "jay.bsky.team" -> "jay.bsky.team"
     */
    extractHandle(input) {
        const raw = (input || '').trim();
        const urlMatch = raw.match(/bsky\.app\/profile\/([a-zA-Z0-9_.-]+)/i);
        if (urlMatch) return urlMatch[1];
        if (raw.startsWith('@')) return raw.replace('@', '');
        if (raw.endsWith('.bsky.social') || raw.includes('.')) {
            return raw.replace(/^https?:\/\//, '').split('/')[0];
        }
        return raw;
    }

    extractUsername(input) {
        return this.extractHandle(input);
    }

    resolveUrl(input) {
        const raw = (input || '').trim();
        if (raw.includes('/rss') || raw.endsWith('.rss')) {
            return raw;
        }
        const handle = this.extractHandle(raw);
        return `https://bsky.app/profile/${handle}/rss`;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);
        const handle = this.extractHandle(feed.feedUrl);

        return rawItems.map(item => {
            const canonicalLink = item.link || `https://bsky.app/profile/${handle}`;

            // Extraire les hashtags du post
            const hashtags = (item.title || '')
                .match(/#([a-zA-Z0-9_]+)/g)
                ?.map(h => h.replace('#', '').toLowerCase()) || [];

            return {
                ...item,
                author: `@${handle}`,
                link: canonicalLink,
                tags: Array.from(new Set([...(item.tags || []), 'bluesky', 'bsky', handle.toLowerCase(), ...hashtags]))
            };
        });
    }
}

module.exports = { BlueskyFeedProvider };
