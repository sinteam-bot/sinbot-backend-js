/**
 * src/modules/util_autofeeds/services/providers/youtube.provider.js
 *
 * Fournisseur YouTube utilisant les flux RSS de chaînes et playlists.
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class YouTubeFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'youtube',
            label: 'YouTube',
            icon: '📺',
            description: 'Surveille les nouvelles vidéos d\'une chaîne ou playlist YouTube.'
        });

        this.rssProvider = new RssFeedProvider();
    }

    /**
     * Résout une URL ou handle YouTube en URL RSS officielle.
     * Exemples:
     * - "https://www.youtube.com/channel/UCxxxx" -> "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxx"
     * - "UCxxxx" -> "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxx"
     * - "https://www.youtube.com/playlist?list=PLxxxx" -> "https://www.youtube.com/feeds/videos.xml?playlist_id=PLxxxx"
     */
    resolveUrl(input) {
        const raw = (input || '').trim();

        // Si déjà une URL de flux RSS YouTube
        if (raw.includes('youtube.com/feeds/videos.xml')) {
            return raw;
        }

        // Si ID de chaîne direct (UC...)
        if (/^UC[\w-]{22}$/.test(raw)) {
            return `https://www.youtube.com/feeds/videos.xml?channel_id=${raw}`;
        }

        // Si URL chaîne standard : /channel/UC...
        const channelMatch = raw.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
        if (channelMatch) {
            return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
        }

        // Si playlist : list=PL...
        const playlistMatch = raw.match(/[?&]list=(PL[\w-]+)/i);
        if (playlistMatch) {
            return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistMatch[1]}`;
        }

        return raw;
    }

    /**
     * Extrait l'ID de la vidéo YouTube depuis l'URL ou le tag.
     */
    extractVideoId(link, id) {
        const match = (link || '').match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/i);
        if (match) return match[1];
        const idMatch = (id || '').match(/yt:video:([\w-]{11})/i);
        if (idMatch) return idMatch[1];
        return null;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);

        return rawItems.map(item => {
            const videoId = this.extractVideoId(item.link, item.id);
            const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : item.link;
            const thumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : item.imageUrl;

            return {
                ...item,
                link: videoUrl,
                imageUrl: thumbnailUrl,
                tags: Array.from(new Set([...(item.tags || []), 'youtube', 'video'])),
                extra: {
                    ...item.extra,
                    videoId
                }
            };
        });
    }
}

module.exports = { YouTubeFeedProvider };
