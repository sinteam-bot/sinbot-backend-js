/**
 * src/modules/util_autofeeds/services/providers/provider-registry.js
 *
 * Registre centralisé des fournisseurs de flux (RSS, YouTube, Reddit, etc.).
 */

const { RssFeedProvider } = require('./rss.provider.js');
const { YouTubeFeedProvider } = require('./youtube.provider.js');
const { RedditFeedProvider } = require('./reddit.provider.js');
const { GoogleNewsFeedProvider } = require('./google-news.provider.js');

class ProviderRegistry {
    constructor() {
        this.providers = new Map();

        // Enregistrement des providers actifs
        this.register(new RssFeedProvider());
        this.register(new YouTubeFeedProvider());
        this.register(new RedditFeedProvider());
        this.register(new GoogleNewsFeedProvider());
    }

    register(provider) {
        this.providers.set(provider.name, provider);
    }

    get(name) {
        return this.providers.get(name) || this.providers.get('rss');
    }

    /**
     * Détecte automatiquement le fournisseur le plus approprié selon l'URL.
     * @param {string} url
     * @returns {string} nom du provider ('youtube', 'reddit', 'google_news', ou 'rss')
     */
    detectProvider(url = '') {
        const lower = url.toLowerCase();

        if (lower.includes('youtube.com') || lower.includes('youtu.be') || /^UC[\w-]{22}$/.test(url)) {
            return 'youtube';
        }
        if (lower.includes('reddit.com') || /^\/?r\/[a-zA-Z0-9_]+/i.test(url)) {
            return 'reddit';
        }
        if (lower.includes('news.google.com')) {
            return 'google_news';
        }
        if (lower.includes('twitter.com') || lower.includes('x.com') || lower.includes('nitter.')) {
            return 'twitter';
        }
        if (lower.includes('twitch.tv')) {
            return 'twitch';
        }
        if (lower.includes('kick.com')) {
            return 'kick';
        }
        if (lower.includes('tiktok.com')) {
            return 'tiktok';
        }
        if (lower.includes('instagram.com')) {
            return 'instagram';
        }

        return 'rss';
    }

    /**
     * Liste tous les fournisseurs disponibles et leurs capacités.
     */
    list() {
        const active = Array.from(this.providers.values()).map(p => ({
            name: p.name,
            label: p.label,
            icon: p.icon,
            description: p.description,
            status: 'active'
        }));

        // Fournisseurs additionnels prévus dans l'architecture
        const upcoming = [
            { name: 'twitter', label: 'X / Twitter', icon: '🐦', description: 'Surveillance de comptes via flux Nitter/RSS ou API.', status: 'compatible_rss' },
            { name: 'twitch', label: 'Twitch', icon: '🟣', description: 'Alertes de lives et clips de chaînes Twitch.', status: 'planned' },
            { name: 'kick', label: 'Kick', icon: '🟢', description: 'Alertes de streams Kick.', status: 'planned' },
            { name: 'tiktok', label: 'TikTok', icon: '🎵', description: 'Suivi de créateurs TikTok via passerelle RSS.', status: 'planned' },
            { name: 'instagram', label: 'Instagram', icon: '📸', description: 'Nouveaux posts de comptes Instagram publics.', status: 'planned' },
            { name: 'facebook', label: 'Facebook', icon: '👥', description: 'Publications de pages publiques Facebook.', status: 'planned' },
            { name: 'linkedin', label: 'LinkedIn', icon: '💼', description: 'Actualités d\'entreprises et créateurs.', status: 'planned' }
        ];

        return [...active, ...upcoming];
    }
}

const providerRegistry = new ProviderRegistry();

module.exports = { providerRegistry, ProviderRegistry };
