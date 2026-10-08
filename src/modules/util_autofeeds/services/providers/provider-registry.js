/**
 * src/modules/util_autofeeds/services/providers/provider-registry.js
 *
 * Registre centralisé des fournisseurs de flux (RSS, YouTube, YouTube Live, Reddit, Twitch, Kick, Twitter, etc.).
 */

const { RssFeedProvider } = require('./rss.provider.js');
const { YouTubeFeedProvider } = require('./youtube.provider.js');
const { YouTubeLiveFeedProvider } = require('./youtube-live.provider.js');
const { RedditFeedProvider } = require('./reddit.provider.js');
const { GoogleNewsFeedProvider } = require('./google-news.provider.js');
const { TwitchFeedProvider } = require('./twitch.provider.js');
const { KickFeedProvider } = require('./kick.provider.js');
const { TwitterFeedProvider } = require('./twitter.provider.js');
const { TikTokFeedProvider } = require('./tiktok.provider.js');
const { BlueskyFeedProvider } = require('./bluesky.provider.js');
const { GithubFeedProvider } = require('./github.provider.js');
const { GitlabFeedProvider } = require('./gitlab.provider.js');
const { StatusPageFeedProvider } = require('./status-page.provider.js');
const { SteamFeedProvider } = require('./steam.provider.js');
const {
    InstagramFeedProvider,
    FacebookFeedProvider,
    LinkedInFeedProvider
} = require('./social-bridge.provider.js');

class ProviderRegistry {
    constructor() {
        this.providers = new Map();

        // Enregistrement des 17 fournisseurs actifs
        this.register(new RssFeedProvider());
        this.register(new YouTubeFeedProvider());
        this.register(new YouTubeLiveFeedProvider());
        this.register(new RedditFeedProvider());
        this.register(new GoogleNewsFeedProvider());
        this.register(new TwitchFeedProvider());
        this.register(new KickFeedProvider());
        this.register(new TwitterFeedProvider());
        this.register(new TikTokFeedProvider());
        this.register(new BlueskyFeedProvider());
        this.register(new GithubFeedProvider());
        this.register(new GitlabFeedProvider());
        this.register(new StatusPageFeedProvider());
        this.register(new SteamFeedProvider());
        this.register(new InstagramFeedProvider());
        this.register(new FacebookFeedProvider());
        this.register(new LinkedInFeedProvider());
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
     * @returns {string} nom du provider
     */
    detectProvider(url = '') {
        const lower = url.toLowerCase();

        // Si direct YouTube ciblé spécifiquement
        if (lower.includes('youtube.com') && (lower.includes('/live') || lower.endsWith('/live'))) {
            return 'youtube_live';
        }
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
        if (lower.includes('twitch.tv') || lower.startsWith('twitch:')) {
            return 'twitch';
        }
        if (lower.includes('kick.com') || lower.startsWith('kick:')) {
            return 'kick';
        }
        if (lower.includes('tiktok.com')) {
            return 'tiktok';
        }
        if (lower.includes('bsky.app') || lower.endsWith('.bsky.social') || lower.includes('bsky.social')) {
            return 'bluesky';
        }
        if (lower.includes('steampowered.com') || lower.includes('steamcommunity.com') || lower.startsWith('steam:') || /^[0-9]{3,7}$/.test(url.trim())) {
            return 'steam';
        }
        if (lower.includes('github.com') || lower.startsWith('github:') || (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(url.trim()) && !lower.startsWith('r/'))) {
            return 'github';
        }
        if (lower.includes('gitlab.com') || lower.startsWith('gitlab:')) {
            return 'gitlab';
        }
        if (lower.includes('statuspage.io') || lower.includes('status.') || lower.includes('discordstatus.com') || lower.includes('cloudflarestatus.com') || lower.includes('statuspage')) {
            return 'statuspage';
        }
        if (lower.includes('instagram.com')) {
            return 'instagram';
        }
        if (lower.includes('facebook.com')) {
            return 'facebook';
        }
        if (lower.includes('linkedin.com')) {
            return 'linkedin';
        }

        return 'rss';
    }

    /**
     * Liste tous les fournisseurs disponibles et leurs capacités.
     */
    list() {
        return Array.from(this.providers.values()).map(p => ({
            name: p.name,
            label: p.label,
            icon: p.icon,
            description: p.description,
            status: 'active'
        }));
    }
}

const providerRegistry = new ProviderRegistry();

module.exports = { providerRegistry, ProviderRegistry };
