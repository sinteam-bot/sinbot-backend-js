/**
 * src/modules/util_autofeeds/services/providers/youtube.provider.js
 *
 * Fournisseur YouTube utilisant les flux RSS de chaînes et playlists,
 * avec détection native des diffusions en direct (YouTube Live).
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class YouTubeFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'youtube',
            label: 'YouTube',
            icon: '📺',
            description: 'Surveille les nouvelles vidéos et les diffusions en direct (Live) d\'une chaîne YouTube.'
        });

        this.rssProvider = new RssFeedProvider();
    }

    /**
     * Résout une URL ou handle YouTube en URL de suivi.
     * Exemples:
     * - "https://www.youtube.com/channel/UCxxxx" -> "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxx"
     * - "UCxxxx" -> "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxx"
     * - "https://www.youtube.com/playlist?list=PLxxxx" -> "https://www.youtube.com/feeds/videos.xml?playlist_id=PLxxxx"
     * - "@Zerator" -> "https://www.youtube.com/@Zerator"
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

        if (raw.startsWith('@')) {
            return `https://www.youtube.com/${raw}`;
        }

        return raw;
    }

    /**
     * Extrait l'identifiant de la chaîne ou le handle de l'URL.
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

    /**
     * Sonde la page /live de la chaîne pour détecter un live en cours.
     */
    async fetchLiveStream(target) {
        if (!target) return null;
        const liveUrl = target.type === 'handle'
            ? `https://www.youtube.com/@${target.value}/live`
            : `https://www.youtube.com/channel/${target.value}/live`;

        try {
            const res = await fetch(liveUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                redirect: 'follow',
                signal: AbortSignal.timeout(5000)
            });

            if (!res.ok) return null;
            const html = await res.text();

            const isLive = html.includes('"isLive":true') || html.includes('"isLiveBroadcast":true');
            if (!isLive) return null;

            const videoIdMatch = html.match(/<meta itemprop="videoId" content="([a-zA-Z0-9_-]{11})">/)
                || html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            if (!videoIdMatch) return null;

            const videoId = videoIdMatch[1];
            const titleMatch = html.match(/<meta name="title" content="([^"]+)">/)
                || html.match(/<title>([^<]+)<\/title>/);
            const rawTitle = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'Diffusion en direct sur YouTube';

            const authorMatch = html.match(/<link itemprop="name" content="([^"]+)">/)
                || html.match(/"ownerChannelName":"([^"]+)"/);
            const author = authorMatch ? authorMatch[1].trim() : (target.value || 'YouTube');

            return {
                id: `youtube:live:${target.value}:${videoId}`,
                title: `🔴 [LIVE] ${author} est en direct sur YouTube !`,
                content: rawTitle,
                link: `https://www.youtube.com/watch?v=${videoId}`,
                author: `@${author.replace('@', '')}`,
                imageUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                publishedAt: Date.now(),
                tags: ['youtube', 'live', 'stream', target.value.toLowerCase(), author.toLowerCase()],
                extra: {
                    isLive: true,
                    videoId
                }
            };
        } catch {
            return null;
        }
    }

    async fetchItems(feed) {
        const items = [];

        // 1. Détection de live YouTube en direct
        const target = this.extractHandleOrChannel(feed.feedUrl);
        if (target) {
            const liveItem = await this.fetchLiveStream(target);
            if (liveItem) {
                items.push(liveItem);
            }
        }

        // 2. Vidéos publiées (via flux RSS si URL supportée)
        try {
            const rawItems = await this.rssProvider.fetchItems(feed);
            for (const item of rawItems) {
                const videoId = this.extractVideoId(item.link, item.id);
                const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : item.link;
                const thumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : item.imageUrl;

                items.push({
                    ...item,
                    link: videoUrl,
                    imageUrl: thumbnailUrl,
                    tags: Array.from(new Set([...(item.tags || []), 'youtube', 'video'])),
                    extra: {
                        ...item.extra,
                        videoId
                    }
                });
            }
        } catch {
            // Ignoré si l'URL ne supporte pas le flux RSS natif (ex: @handle sans RSS)
        }

        return items;
    }
}

module.exports = { YouTubeFeedProvider };
