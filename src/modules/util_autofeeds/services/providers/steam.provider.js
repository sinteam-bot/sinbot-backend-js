/**
 * src/modules/util_autofeeds/services/providers/steam.provider.js
 *
 * Fournisseur Steam officiel pour la récupération des patch notes,
 * mises à jour et annonces de jeux par AppID ou URL de magasin.
 */

const { BaseFeedProvider } = require('./base.provider.js');

class SteamFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'steam',
            label: 'Steam Patches & News',
            icon: '🎮',
            description: 'Surveillance des annonces et patch notes officielles de jeux Steam par AppID.'
        });
    }

    /**
     * Extrait l'AppID numérique depuis une URL ou une chaîne.
     * Exemples:
     * - "730" -> "730"
     * - "steam:730" -> "730"
     * - "https://store.steampowered.com/app/730/CounterStrike_2/" -> "730"
     * - "https://steamcommunity.com/app/252490/announcements" -> "252490"
     */
    extractAppId(input) {
        const raw = (input || '').trim().replace(/^steam:/i, '');
        const urlMatch = raw.match(/\/app\/([0-9]+)/i);
        if (urlMatch) {
            return urlMatch[1];
        }
        const numericMatch = raw.match(/^([0-9]+)$/);
        if (numericMatch) {
            return numericMatch[1];
        }
        return raw;
    }

    resolveUrl(input) {
        const appId = this.extractAppId(input);
        return `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=10&maxlength=2000&format=json`;
    }

    tagItem(item = {}) {
        const tags = ['#steam', '#gaming', '#patch', '#update'];
        const versionMatch = (item.title || '').match(/v?([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
        if (versionMatch) tags.push(`#v${versionMatch[1]}`);
        if (item.appId) tags.push(`#app${item.appId}`);
        return tags;
    }

    cleanBbcode(text = '') {
        return this.cleanBbCode(text);
    }

    /**
     * Convertit le BBCode Steam en Markdown propre pour Discord.
     */
    cleanBbCode(text = '') {
        if (!text || typeof text !== 'string') return '';
        let out = text
            .replace(/\[b\](.*?)\[\/b\]/gi, '**$1**')
            .replace(/\[i\](.*?)\[\/i\]/gi, '*$1*')
            .replace(/\[u\](.*?)\[\/u\]/gi, '__$1__')
            .replace(/\[strike\](.*?)\[\/strike\]/gi, '~~$1~~')
            .replace(/\[h1\](.*?)\[\/h1\]/gi, '# $1\n')
            .replace(/\[h2\](.*?)\[\/h2\]/gi, '## $1\n')
            .replace(/\[h3\](.*?)\[\/h3\]/gi, '### $1\n')
            .replace(/\[url=(.*?)\](.*?)\[\/url\]/gi, '[$2]($1)')
            .replace(/\[list\]/gi, '')
            .replace(/\[\/list\]/gi, '')
            .replace(/\[\*\]/gi, '• ')
            .replace(/\[code\](.*?)\[\/code\]/gis, '`$1`')
            .replace(/\[img\].*?\[\/img\]/gis, '')
            .replace(/\{STEAM_CLAN_IMAGE\}\/[^\s]+/gi, '')
            .replace(/<[^>]*>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        if (out.length > 500) {
            out = out.slice(0, 497) + '...';
        }
        return out;
    }

    async fetchItems(feed) {
        const appId = this.extractAppId(feed.feedUrl);
        const apiUrl = this.resolveUrl(feed.feedUrl);
        const headerImage = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

        const res = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'ChienneBot/3.0 (SteamNewsFetcher)'
            }
        });

        if (!res.ok) {
            throw new Error(`Steam API responded with HTTP ${res.status}`);
        }

        const data = await res.json();
        const newsItems = data?.appnews?.newsitems || [];

        return newsItems.map(item => {
            const cleanSnippet = this.cleanBbCode(item.contents || '');
            const publishedAt = item.date ? Number(item.date) * 1000 : Date.now();
            const tags = this.tagItem({ title: item.title, appId });

            return {
                id: item.gid || `steam:${appId}:${item.date}`,
                guid: item.gid || `steam:${appId}:${item.date}`,
                title: item.title || `Mise à jour Steam (AppID ${appId})`,
                link: item.url || `https://store.steampowered.com/news/app/${appId}`,
                url: item.url || `https://store.steampowered.com/news/app/${appId}`,
                author: item.author || 'Développeurs Steam',
                contentSnippet: cleanSnippet,
                publishedAt,
                imageUrl: headerImage,
                tags,
                source: 'steam',
                appId
            };
        });
    }
}

module.exports = { SteamFeedProvider };
