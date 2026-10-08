/**
 * src/modules/util_autofeeds/services/autofeeds-purge.service.js
 *
 * Service de nettoyage automatique (Auto-Purge) :
 * - Suppression des messages Discord obsolètes (deals expirés, vieilles alertes)
 * - Rétention paramétrable par flux (autoExpireDays)
 */

class AutofeedsPurgeService {
    constructor({ repository = null, client = null } = {}) {
        this.repository = repository;
        this.client = client;
    }

    setClient(client) {
        this.client = client;
    }

    setRepository(repository) {
        this.repository = repository;
    }

    /**
     * Exécute le cycle de purge des messages Discord expirés pour tous les flux actifs ou un flux spécifique.
     * @param {Object} options
     * @param {string|null} options.feedId Filtrer par flux spécifique
     * @param {number|null} options.defaultExpireDays Jours de rétention par défaut si non spécifié sur le flux
     * @returns {Promise<Object>} Statistiques de purge { scanned, purged, errors }
     */
    async purgeExpiredMessages(options = {}) {
        const opts = typeof options === 'string' ? { feedId: options } : (options || {});
        const feedId = opts.feedId || null;
        const defaultExpireDays = opts.defaultExpireDays || 7;
        if (opts.client) {
            this.client = opts.client;
        }

        if (!this.repository) {
            return { scanned: 0, purged: 0, errors: 0, expiredCount: 0, deletedMessagesCount: 0 };
        }

        const stats = { scanned: 0, purged: 0, errors: 0, expiredCount: 0, deletedMessagesCount: 0 };
        try {
            // Récupérer les flux avec autoExpireDays > 0 (ou tous si feedId spécifié)
            let feeds = [];
            if (feedId) {
                const feed = await this.repository.getFeedById(feedId);
                if (feed) feeds = [feed];
            } else {
                const allActive = await this.repository.listAllActive();
                feeds = allActive.filter(f => (f.autoExpireDays && f.autoExpireDays > 0));
            }

            for (const feed of feeds) {
                const expireDays = feed.autoExpireDays > 0 ? feed.autoExpireDays : defaultExpireDays;
                if (expireDays <= 0) continue;

                const expiredItems = await this.repository.getExpiredHistory(expireDays);
                const feedItems = expiredItems.filter(item => item.feedId === feed.id);

                stats.scanned += feedItems.length;

                for (const item of feedItems) {
                    try {
                        let deletedFromDiscord = false;
                        if (this.client && item.channelId && item.messageId) {
                            try {
                                const channel = await this.client.channels.fetch(item.channelId).catch(() => null);
                                if (channel && typeof channel.messages?.fetch === 'function') {
                                    const msg = await channel.messages.fetch(item.messageId).catch(() => null);
                                    if (msg && typeof msg.delete === 'function') {
                                        await msg.delete().catch(() => {});
                                        deletedFromDiscord = true;
                                        stats.deletedMessagesCount++;
                                    }
                                }
                            } catch {
                                // Erreur de suppression Discord
                            }
                        }

                        await this.repository.markHistoryExpired(item.id);
                        stats.purged++;
                        stats.expiredCount++;
                    } catch (err) {
                        stats.errors++;
                    }
                }
            }
        } catch (err) {
            stats.errors++;
        }

        return stats;
    }
}

const autofeedsPurgeService = new AutofeedsPurgeService();

module.exports = {
    AutofeedsPurgeService,
    autofeedsPurgeService
};
