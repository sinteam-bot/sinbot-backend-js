/**
 * src/modules/util_autofeeds/services/providers/social-bridge.provider.js
 *
 * Fournisseurs de passerelles pour Instagram, Facebook et LinkedIn via RSSHub / syndication.
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class InstagramFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'instagram',
            label: 'Instagram',
            icon: '📸',
            description: 'Surveillance des nouvelles photos et réels de comptes Instagram.'
        });
        this.rssProvider = new RssFeedProvider();
        this.defaultGateway = 'https://rsshub.app/instagram/user';
    }

    extractUsername(input) {
        const raw = (input || '').trim();
        const match = raw.match(/instagram\.com\/([a-zA-Z0-9_.-]{1,30})/i);
        if (match) return match[1];
        if (/^@?([a-zA-Z0-9_.-]{1,30})$/.test(raw)) return raw.replace('@', '');
        return raw;
    }

    resolveUrl(input) {
        const raw = (input || '').trim();
        if (raw.endsWith('/rss') || raw.includes('/instagram/user/')) return raw;
        const user = this.extractUsername(raw);
        return `${this.defaultGateway}/${user}`;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);
        const username = this.extractUsername(feed.feedUrl);
        return rawItems.map(item => ({
            ...item,
            author: `@${username}`,
            link: item.link || `https://instagram.com/${username}`,
            tags: Array.from(new Set([...(item.tags || []), 'instagram', 'photo', username.toLowerCase()]))
        }));
    }
}

class FacebookFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'facebook',
            label: 'Facebook',
            icon: '👥',
            description: 'Publications de pages publiques Facebook.'
        });
        this.rssProvider = new RssFeedProvider();
        this.defaultGateway = 'https://rsshub.app/facebook/page';
    }

    extractPage(input) {
        const raw = (input || '').trim();
        const match = raw.match(/facebook\.com\/([a-zA-Z0-9_.-]{2,50})/i);
        if (match) return match[1];
        return raw;
    }

    resolveUrl(input) {
        const raw = (input || '').trim();
        if (raw.endsWith('/rss') || raw.includes('/facebook/page/')) return raw;
        const page = this.extractPage(raw);
        return `${this.defaultGateway}/${page}`;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);
        const page = this.extractPage(feed.feedUrl);
        return rawItems.map(item => ({
            ...item,
            author: page,
            link: item.link || `https://facebook.com/${page}`,
            tags: Array.from(new Set([...(item.tags || []), 'facebook', page.toLowerCase()]))
        }));
    }
}

class LinkedInFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'linkedin',
            label: 'LinkedIn',
            icon: '💼',
            description: 'Publications et offres d\'entreprises LinkedIn.'
        });
        this.rssProvider = new RssFeedProvider();
        this.defaultGateway = 'https://rsshub.app/linkedin/company';
    }

    extractCompany(input) {
        const raw = (input || '').trim();
        const match = raw.match(/linkedin\.com\/company\/([a-zA-Z0-9_-]{2,60})/i);
        if (match) return match[1];
        return raw;
    }

    resolveUrl(input) {
        const raw = (input || '').trim();
        if (raw.endsWith('/rss') || raw.includes('/linkedin/company/')) return raw;
        const company = this.extractCompany(raw);
        return `${this.defaultGateway}/${company}`;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);
        const company = this.extractCompany(feed.feedUrl);
        return rawItems.map(item => ({
            ...item,
            author: company,
            link: item.link || `https://linkedin.com/company/${company}`,
            tags: Array.from(new Set([...(item.tags || []), 'linkedin', 'emploi', company.toLowerCase()]))
        }));
    }
}

module.exports = {
    InstagramFeedProvider,
    FacebookFeedProvider,
    LinkedInFeedProvider
};
