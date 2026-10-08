/**
 * src/modules/util_autofeeds/services/providers/kick.provider.js
 *
 * Fournisseur Kick pour surveiller les diffusions en direct sur la plateforme Kick.
 */

const { BaseFeedProvider } = require('./base.provider.js');

class KickFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'kick',
            label: 'Kick',
            icon: '🟢',
            description: 'Alertes de diffusions en direct sur Kick.',
            isLive: true
        });
    }

    extractUsername(input) {
        const raw = (input || '').trim();
        const urlMatch = raw.match(/kick\.com\/([a-zA-Z0-9_-]{2,30})/i);
        if (urlMatch) return urlMatch[1].toLowerCase();
        const prefixMatch = raw.match(/kick:([a-zA-Z0-9_-]{2,30})/i);
        if (prefixMatch) return prefixMatch[1].toLowerCase();
        if (/^[a-zA-Z0-9_-]{2,30}$/.test(raw)) return raw.toLowerCase();
        return raw;
    }

    resolveUrl(input) {
        const user = this.extractUsername(input);
        return `https://kick.com/${user}`;
    }

    async fetchItems(feed) {
        const username = this.extractUsername(feed.feedUrl);
        const channelUrl = `https://kick.com/${username}`;

        try {
            const apiUrl = `https://kick.com/api/v2/channels/${username}`;
            const res = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(6000)
            });

            if (res.ok) {
                const data = await res.json();
                const livestream = data?.livestream;

                if (livestream && livestream.is_live) {
                    const preview = livestream.thumbnail?.url || data?.user?.profile_pic || null;
                    const streamTitle = livestream.session_title || 'En live sur Kick';

                    return [{
                        id: `kick:${username}:${livestream.id}`,
                        title: `🟢 [LIVE] ${data.user?.username || username} est en direct sur Kick !`,
                        content: streamTitle,
                        link: channelUrl,
                        author: data.user?.username || username,
                        imageUrl: preview,
                        publishedAt: new Date(livestream.created_at || Date.now()).getTime(),
                        tags: ['kick', 'live', 'stream', username, (livestream.categories?.[0]?.name || '').toLowerCase()].filter(Boolean),
                        extra: {
                            viewers: livestream.viewer_count,
                            category: livestream.categories?.[0]?.name
                        }
                    }];
                }
            }
        } catch {
            // En cas d'erreur ou timeout
        }

        return [];
    }
}

module.exports = { KickFeedProvider };
