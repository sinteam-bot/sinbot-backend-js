/**
 * src/modules/util_autofeeds/services/providers/reddit.provider.js
 *
 * Fournisseur Reddit utilisant les flux RSS natifs de subreddits et utilisateurs.
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class RedditFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'reddit',
            label: 'Reddit',
            icon: '🤖',
            description: 'Surveille les nouveaux posts d\'un subreddit ou utilisateur Reddit.'
        });

        this.rssProvider = new RssFeedProvider();
    }

    /**
     * Résout un nom de subreddit ou URL Reddit en flux RSS valide.
     * Exemples:
     * - "r/FreeGameFindings" -> "https://www.reddit.com/r/FreeGameFindings/new.rss"
     * - "https://www.reddit.com/r/GameDeals" -> "https://www.reddit.com/r/GameDeals/new.rss"
     */
    resolveUrl(input) {
        let raw = (input || '').trim();

        // Si format court : r/subreddit ou /r/subreddit
        const subMatch = raw.match(/^\/?r\/([a-zA-Z0-9_]+)\/?$/i);
        if (subMatch) {
            return `https://www.reddit.com/r/${subMatch[1]}/new.rss`;
        }

        // Si URL complète de subreddit sans .rss
        const urlMatch = raw.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)(?:\/(?:new|hot|top))?\/?$/i);
        if (urlMatch) {
            return `https://www.reddit.com/r/${urlMatch[1]}/new.rss`;
        }

        // Si URL reddit sans extension .rss
        if (raw.includes('reddit.com') && !raw.endsWith('.rss')) {
            return raw.replace(/\/$/, '') + '/.rss';
        }

        return raw;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);

        return rawItems.map(item => {
            // Extraire subreddit depuis le lien ou feedUrl
            const subMatch = (feed.feedUrl || item.link || '').match(/reddit\.com\/r\/([a-zA-Z0-9_]+)/i);
            const subreddit = subMatch ? subMatch[1].toLowerCase() : 'reddit';

            return {
                ...item,
                tags: Array.from(new Set([...(item.tags || []), 'reddit', subreddit])),
                extra: {
                    ...item.extra,
                    subreddit
                }
            };
        });
    }
}

module.exports = { RedditFeedProvider };
