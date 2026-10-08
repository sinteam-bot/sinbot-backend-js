/**
 * src/modules/util_autofeeds/services/providers/gitlab.provider.js
 *
 * Fournisseur GitLab pour la surveillance des Releases et Tags via flux Atom officiels.
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class GitlabFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'gitlab',
            label: 'GitLab Releases',
            icon: '🦊',
            description: 'Surveillance des nouvelles versions (Tags, Releases) d\'un projet GitLab.'
        });

        this.rssProvider = new RssFeedProvider();
    }

    /**
     * Extrait "owner/repo" depuis une URL ou une chaîne.
     */
    extractRepo(input) {
        const raw = (input || '').trim().replace(/^gitlab:/i, '');
        const urlMatch = raw.match(/gitlab\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
        if (urlMatch) {
            return `${urlMatch[1]}/${urlMatch[2].replace(/\.git$/, '')}`;
        }
        const shorthandMatch = raw.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
        if (shorthandMatch) {
            return `${shorthandMatch[1]}/${shorthandMatch[2]}`;
        }
        return raw;
    }

    resolveUrl(input) {
        const raw = (input || '').trim();
        if (raw.endsWith('.atom') || raw.includes('/-/tags?format=atom')) {
            return raw;
        }
        const repo = this.extractRepo(raw);
        return `https://gitlab.com/${repo}/-/tags?format=atom`;
    }

    tagItem(item = {}) {
        return ['#gitlab', '#release'];
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);
        const repo = this.extractRepo(feed.feedUrl);

        return rawItems.map(item => {
            const tags = Array.isArray(item.tags) ? [...item.tags] : [];
            tags.push('gitlab', 'release');
            if (repo) tags.push(repo.split('/')[1]);

            return {
                ...item,
                author: item.author || repo.split('/')[0] || 'GitLab',
                tags: Array.from(new Set(tags)),
                category: feed.category || 'tech'
            };
        });
    }
}

module.exports = { GitlabFeedProvider };
