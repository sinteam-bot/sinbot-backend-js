/**
 * src/modules/util_autofeeds/services/providers/tiktok.provider.js
 *
 * Fournisseur TikTok utilisant les passerelles RSS ProxiTok / RSSHub.
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class TikTokFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'tiktok',
            label: 'TikTok',
            icon: '🎵',
            description: 'Surveillance des nouvelles vidéos de créateurs TikTok.'
        });

        this.rssProvider = new RssFeedProvider();
        this.defaultGateway = 'https://proxitok.pabloferreiro.es';
    }

    extractUsername(input) {
        const raw = (input || '').trim();
        const urlMatch = raw.match(/tiktok\.com\/@?([a-zA-Z0-9_.-]{2,30})/i);
        if (urlMatch) return urlMatch[1].replace('@', '');
        if (/^@?([a-zA-Z0-9_.-]{2,30})$/.test(raw)) {
            return raw.replace('@', '');
        }
        return raw;
    }

    resolveUrl(input) {
        const raw = (input || '').trim();
        if (raw.endsWith('/rss') || raw.includes('/rss?')) {
            return raw;
        }
        const user = this.extractUsername(raw);
        return `${this.defaultGateway}/@${user}/rss`;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);
        const username = this.extractUsername(feed.feedUrl);

        return rawItems.map(item => {
            const canonicalLink = item.link?.replace(/proxitok\.[a-z.]+/, 'tiktok.com') || `https://www.tiktok.com/@${username}`;

            return {
                ...item,
                author: `@${username}`,
                link: canonicalLink,
                tags: Array.from(new Set([...(item.tags || []), 'tiktok', 'video', username.toLowerCase()]))
            };
        });
    }
}

module.exports = { TikTokFeedProvider };
