/**
 * src/modules/util_autofeeds/services/providers/youtube-live.provider.js
 *
 * Fournisseur spécialisé pour la détection et la surveillance des diffusions
 * en direct (Lives) sur YouTube.
 */

const { BaseFeedProvider } = require('./base.provider.js');

class YouTubeLiveFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'youtube_live',
            label: 'YouTube Live',
            icon: '🔴',
            description: 'Surveille les diffusions en direct (Live) d\'une chaîne YouTube.',
            isLive: true
        });
    }

    /**
     * Résout une URL ou un handle YouTube en URL de suivi /live.
     * Exemples:
     * - "https://www.youtube.com/@Zerator" -> "https://www.youtube.com/@Zerator/live"
     * - "@Zerator" -> "https://www.youtube.com/@Zerator/live"
     * - "https://www.youtube.com/channel/UCxxxx" -> "https://www.youtube.com/channel/UCxxxx/live"
     */
    resolveUrl(input) {
        const raw = (input || '').trim();

        if (raw.endsWith('/live')) {
            return raw;
        }

        if (raw.startsWith('@')) {
            return `https://www.youtube.com/${raw}/live`;
        }

        const handleMatch = raw.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/i);
        if (handleMatch) {
            return `https://www.youtube.com/@${handleMatch[1]}/live`;
        }

        const channelMatch = raw.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
        if (channelMatch) {
            return `https://www.youtube.com/channel/${channelMatch[1]}/live`;
        }

        if (/^UC[\w-]{22}$/.test(raw)) {
            return `https://www.youtube.com/channel/${raw}/live`;
        }

        return raw;
    }

    extractTarget(input) {
        const raw = (input || '').trim();
        const handleMatch = raw.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/i);
        if (handleMatch) return { type: 'handle', value: handleMatch[1] };
        if (raw.startsWith('@')) return { type: 'handle', value: raw.replace('@', '') };

        const chanMatch = raw.match(/channel_id=(UC[\w-]{22})/i) || raw.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
        if (chanMatch) return { type: 'channelId', value: chanMatch[1] };
        if (/^UC[\w-]{22}$/.test(raw)) return { type: 'channelId', value: raw };

        return null;
    }

    async fetchItems(feed) {
        const target = this.extractTarget(feed.feedUrl);
        if (!target) return [];

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
                signal: AbortSignal.timeout(6000)
            });

            if (!res.ok) return [];
            const html = await res.text();

            const isLive = html.includes('"isLive":true') || html.includes('"isLiveBroadcast":true');
            if (!isLive) return [];

            const videoIdMatch = html.match(/<meta itemprop="videoId" content="([a-zA-Z0-9_-]{11})">/)
                || html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            if (!videoIdMatch) return [];

            const videoId = videoIdMatch[1];
            const titleMatch = html.match(/<meta name="title" content="([^"]+)">/)
                || html.match(/<title>([^<]+)<\/title>/);
            const liveTitle = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'Diffusion en direct sur YouTube';

            const authorMatch = html.match(/<link itemprop="name" content="([^"]+)">/)
                || html.match(/"ownerChannelName":"([^"]+)"/);
            const author = authorMatch ? authorMatch[1].trim() : target.value;

            return [{
                id: `youtube:live:${target.value}:${videoId}`,
                title: `🔴 [LIVE] ${author} est en direct sur YouTube !`,
                content: liveTitle,
                link: `https://www.youtube.com/watch?v=${videoId}`,
                author: `@${author.replace('@', '')}`,
                imageUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                publishedAt: Date.now(),
                tags: ['youtube', 'live', 'stream', target.value.toLowerCase(), author.toLowerCase()],
                extra: {
                    isLive: true,
                    videoId,
                    streamId: videoId,
                    streamer: author
                }
            }];
        } catch {
            return [];
        }
    }
}

module.exports = { YouTubeLiveFeedProvider };
