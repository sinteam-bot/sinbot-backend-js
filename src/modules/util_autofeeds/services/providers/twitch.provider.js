/**
 * src/modules/util_autofeeds/services/providers/twitch.provider.js
 *
 * Fournisseur Twitch pour surveiller le statut de live ou les clips d'une chaîne.
 */

const { BaseFeedProvider } = require('./base.provider.js');

class TwitchFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'twitch',
            label: 'Twitch',
            icon: '🟣',
            description: 'Alertes de diffusions en direct et replays sur Twitch.'
        });
    }

    /**
     * Résout l'URL ou le pseudo en identifiant normalisé Twitch.
     * Exemples:
     * - "https://www.twitch.tv/zerator" -> "zerator"
     * - "twitch:zerator" -> "zerator"
     * - "zerator" -> "zerator"
     */
    extractUsername(input) {
        const raw = (input || '').trim();
        const urlMatch = raw.match(/twitch\.tv\/([a-zA-Z0-9_]{3,25})/i);
        if (urlMatch) return urlMatch[1].toLowerCase();
        const prefixMatch = raw.match(/twitch:([a-zA-Z0-9_]{3,25})/i);
        if (prefixMatch) return prefixMatch[1].toLowerCase();
        if (/^[a-zA-Z0-9_]{3,25}$/.test(raw)) return raw.toLowerCase();
        return raw;
    }

    resolveUrl(input) {
        const user = this.extractUsername(input);
        return `https://www.twitch.tv/${user}`;
    }

    /**
     * Récupère l'état du stream Twitch.
     * Si une passerelle RSS ou API est disponible, l'interroge.
     */
    async fetchItems(feed) {
        const username = this.extractUsername(feed.feedUrl);
        const streamUrl = `https://www.twitch.tv/${username}`;

        try {
            // Tentative via endpoint public ou passerelle
            const apiUrl = `https://gql.twitch.tv/gql`;
            // Requête légère de statut
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', // Client ID public du web Twitch
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: `query { user(login: "${username}") { displayName stream { id title game { name } viewersCount previewImageURL(width: 1280, height: 720) createdAt } } }`
                }),
                signal: AbortSignal.timeout(6000)
            });

            if (res.ok) {
                const data = await res.json();
                const userObj = data?.data?.user;
                const stream = userObj?.stream;

                if (stream) {
                    return [{
                        id: `twitch:${username}:${stream.id}`,
                        title: `🔴 [LIVE] ${userObj.displayName || username} est en direct sur Twitch !`,
                        content: stream.title || 'Diffusion en direct sur Twitch',
                        link: streamUrl,
                        author: userObj.displayName || username,
                        imageUrl: stream.previewImageURL || null,
                        publishedAt: new Date(stream.createdAt || Date.now()).getTime(),
                        tags: ['twitch', 'live', 'stream', username, (stream.game?.name || '').toLowerCase()].filter(Boolean),
                        extra: {
                            viewers: stream.viewersCount,
                            game: stream.game?.name
                        }
                    }];
                }
            }
        } catch {
            // En cas d'indisponibilité ou timeout de l'API GQL
        }

        return [];
    }
}

module.exports = { TwitchFeedProvider };
