/**
 * src/modules/util_autofeeds/services/providers/twitter.provider.js
 *
 * Fournisseur X / Twitter utilisant les passerelles RSS Nitter / RSSHub.
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class TwitterFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'twitter',
            label: 'X / Twitter',
            icon: '✖️',
            description: 'Surveillance des tweets et retweets d\'un compte X via passerelle RSS.'
        });

        this.rssProvider = new RssFeedProvider();
        this.defaultGateway = 'https://nitter.privacydev.net';
    }

    extractUsername(input) {
        const raw = (input || '').trim();
        const urlMatch = raw.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]{1,20})/i);
        if (urlMatch) return urlMatch[1].replace('@', '');
        const nitterMatch = raw.match(/nitter\.[a-z.]+\/([a-zA-Z0-9_]{1,20})/i);
        if (nitterMatch) return nitterMatch[1].replace('@', '');
        if (/^@?([a-zA-Z0-9_]{1,20})$/.test(raw)) {
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
        return `${this.defaultGateway}/${user}/rss`;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);
        const username = this.extractUsername(feed.feedUrl);

        return rawItems.map(item => {
            // Extraire les hashtags du tweet
            const hashtags = (item.title || '')
                .match(/#([a-zA-Z0-9_]+)/g)
                ?.map(h => h.replace('#', '').toLowerCase()) || [];

            // Nettoyer les liens Nitter pour rediriger vers X.com officiel
            const canonicalLink = item.link?.replace(/nitter\.[a-z.]+/, 'x.com') || `https://x.com/${username}`;

            return {
                ...item,
                author: `@${username}`,
                link: canonicalLink,
                tags: Array.from(new Set([...(item.tags || []), 'twitter', 'x', username.toLowerCase(), ...hashtags]))
            };
        });
    }
}

module.exports = { TwitterFeedProvider };
