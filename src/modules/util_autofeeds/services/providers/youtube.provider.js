/**
 * src/modules/util_autofeeds/services/providers/youtube.provider.js
 *
 * Fournisseur YouTube dédié aux nouvelles vidéos publiées sur une chaîne
 * ou playlist YouTube via les flux Atom/RSS officiels.
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class YouTubeFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'youtube',
            label: 'YouTube Vidéos',
            icon: '📺',
            description: 'Surveille les nouvelles vidéos publiées sur une chaîne ou playlist YouTube.'
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

        if (raw.includes('youtube.com/feeds/videos.xml')) {
            return raw;
        }

        if (/^UC[\w-]{22}$/.test(raw)) {
            return `https://www.youtube.com/feeds/videos.xml?channel_id=${raw}`;
        }

        const channelMatch = raw.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
        if (channelMatch) {
            return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
        }

        const playlistMatch = raw.match(/[?&]list=(PL[\w-]+)/i);
        if (playlistMatch) {
            return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistMatch[1]}`;
        }

        return raw;
    }

    /**
     * Extrait le handle ou l'ID de chaîne d'une saisie YouTube.
     */
    extractHandleOrChannel(input) {
        const raw = (input || '').trim();
        const handleMatch = raw.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/i);
        if (handleMatch) return { type: 'handle', value: handleMatch[1] };
        if (raw.startsWith('@')) return { type: 'handle', value: raw.replace('@', '') };

        const chanMatch = raw.match(/channel_id=(UC[\w-]{22})/i) || raw.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
        if (chanMatch) return { type: 'channelId', value: chanMatch[1] };
        if (/^UC[\w-]{22}$/.test(raw)) return { type: 'channelId', value: raw };

        return null;
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

    isShort(item) {
        if (!item) return false;
        if (item.extra?.isShort !== undefined) return Boolean(item.extra.isShort);
        const title = (item.title || '').toLowerCase();
        const content = (item.content || '').toLowerCase();
        const link = (item.link || '').toLowerCase();
        return title.includes('#shorts') || content.includes('#shorts') || link.includes('/shorts/');
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);

        const items = rawItems.map(item => {
            const videoId = this.extractVideoId(item.link, item.id);
            const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : item.link;
            const thumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : item.imageUrl;
            const isShort = (item.title || '').toLowerCase().includes('#shorts') ||
                (item.content || '').toLowerCase().includes('#shorts') ||
                (item.link || '').includes('/shorts/');

            const tags = Array.from(new Set([...(item.tags || []), 'youtube', 'video', ...(isShort ? ['shorts'] : [])]));

            return {
                ...item,
                link: videoUrl,
                imageUrl: thumbnailUrl,
                tags,
                extra: {
                    ...item.extra,
                    videoId,
                    isShort
                }
            };
        });

        if (feed.ignoreShorts) {
            return items.filter(i => !i.extra?.isShort);
        }

        return items;
    }
}

module.exports = { YouTubeFeedProvider };
