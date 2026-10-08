/**
 * src/modules/util_autofeeds/services/providers/github.provider.js
 *
 * Fournisseur GitHub pour la surveillance des Releases, Tags et Commits via flux Atom officiels.
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class GithubFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'github',
            label: 'GitHub Releases & Tags',
            icon: '🐙',
            description: 'Surveillance des nouvelles versions (Releases, Tags) d\'un dépôt GitHub.'
        });

        this.rssProvider = new RssFeedProvider();
    }

    /**
     * Extrait "owner/repo" depuis une URL ou une chaîne.
     * Exemples:
     * - "https://github.com/facebook/react" -> "facebook/react"
     * - "https://github.com/facebook/react/releases" -> "facebook/react"
     * - "facebook/react" -> "facebook/react"
     * - "github:facebook/react" -> "facebook/react"
     */
    extractRepo(input) {
        const raw = (input || '').trim().replace(/^github:/i, '');
        const urlMatch = raw.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
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
        if (raw.endsWith('.atom') || raw.includes('/releases.atom') || raw.includes('/tags.atom')) {
            return raw;
        }
        const repo = this.extractRepo(raw);
        if (raw.includes('/tags')) {
            return `https://github.com/${repo}/tags.atom`;
        }
        if (raw.includes('/commits')) {
            return `https://github.com/${repo}/commits.atom`;
        }
        // Par défaut: releases
        return `https://github.com/${repo}/releases.atom`;
    }

    tagItem(item = {}) {
        const tags = ['#github', '#release'];
        const versionMatch = (item.title || '').match(/v?([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[a-zA-Z0-9_.-]+)?)/i);
        if (versionMatch) tags.push(`#${versionMatch[0].toLowerCase()}`);
        return tags;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);
        const repo = this.extractRepo(feed.feedUrl);

        return rawItems.map(item => {
            const versionMatch = (item.title || '').match(/v?([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[a-zA-Z0-9_.-]+)?)/i);
            const versionTag = versionMatch ? versionMatch[0] : null;

            const tags = Array.isArray(item.tags) ? [...item.tags] : [];
            tags.push('github', 'release');
            if (versionTag) tags.push(versionTag.toLowerCase());
            if (repo) tags.push(repo.split('/')[1]);

            return {
                ...item,
                author: item.author || repo.split('/')[0] || 'GitHub',
                tags: Array.from(new Set(tags)),
                category: feed.category || 'tech'
            };
        });
    }
}

module.exports = { GithubFeedProvider };
