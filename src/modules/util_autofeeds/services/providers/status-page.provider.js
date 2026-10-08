/**
 * src/modules/util_autofeeds/services/providers/status-page.provider.js
 *
 * Fournisseur pour la surveillance des Statuspages et incidents de services (Discord Status, Cloudflare, GitHub...).
 */

const { BaseFeedProvider } = require('./base.provider.js');
const { RssFeedProvider } = require('./rss.provider.js');

class StatusPageFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'statuspage',
            label: 'Status & Incidents',
            icon: '🚨',
            description: 'Surveillance des incidents et pannes de services (Discord, Cloudflare, etc.).'
        });

        this.rssProvider = new RssFeedProvider();
    }

    /**
     * Résout l'URL de la Statuspage vers son flux RSS ou Atom d'historique.
     * Exemples:
     * - "discordstatus.com" -> "https://discordstatus.com/history.rss"
     * - "https://www.cloudflarestatus.com" -> "https://www.cloudflarestatus.com/history.rss"
     * - "https://status.epicgames.com" -> "https://status.epicgames.com/history.rss"
     */
    resolveUrl(input) {
        let raw = (input || '').trim();
        if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
            raw = `https://${raw}`;
        }
        if (raw.endsWith('.rss') || raw.endsWith('.atom') || raw.includes('/history.rss') || raw.includes('/history.atom')) {
            return raw;
        }
        const cleanBase = raw.replace(/\/+$/, '');
        return `${cleanBase}/history.rss`;
    }

    tagItem(item = {}) {
        const tags = ['#status', '#incident'];
        const titleLower = (item.title || '').toLowerCase();
        if (titleLower.includes('resolved') || titleLower.includes('résolu')) {
            tags.push('#resolved');
        } else if (titleLower.includes('major') || titleLower.includes('majeur') || titleLower.includes('outage')) {
            tags.push('#outage');
        } else if (titleLower.includes('investigating') || titleLower.includes('monitoring')) {
            tags.push('#investigating');
        }
        if (titleLower.includes('degraded')) {
            tags.push('#degraded');
        }
        return tags;
    }

    async fetchItems(feed) {
        const rawItems = await this.rssProvider.fetchItems(feed);

        return rawItems.map(item => {
            const tags = Array.isArray(item.tags) ? [...item.tags] : [];
            tags.push('incident', 'status');

            // Détection du niveau de gravité dans le titre
            const titleLower = (item.title || '').toLowerCase();
            if (titleLower.includes('resolved') || titleLower.includes('résolu')) {
                tags.push('resolved');
            } else if (titleLower.includes('major') || titleLower.includes('majeur') || titleLower.includes('outage')) {
                tags.push('outage');
            } else if (titleLower.includes('investigating') || titleLower.includes('monitoring')) {
                tags.push('investigating');
            }

            return {
                ...item,
                tags: Array.from(new Set(tags)),
                category: feed.category || 'tech'
            };
        });
    }
}

module.exports = { StatusPageFeedProvider };
