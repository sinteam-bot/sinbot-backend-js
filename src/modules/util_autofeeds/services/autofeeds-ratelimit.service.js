/**
 * src/modules/util_autofeeds/services/autofeeds-ratelimit.service.js
 *
 * Service de gestion des heures silencieuses (Quiet Hours) et régulateur anti-flood / rate limiter.
 */

class AutofeedsRateLimitService {
    constructor() {
        /** @type {Map<string, number[]>} feedId -> liste des timestamps d'envoi */
        this.postTimestamps = new Map();
    }

    /**
     * Vérifie si l'heure courante (ou heure fournie) est dans la plage des heures silencieuses.
     * @param {{ enabled?: boolean, start?: string, end?: string }} quietHours
     * @param {Date} [nowDate]
     * @returns {boolean}
     */
    isQuietTime(feedOrQuietHours, nowDate = new Date()) {
        if (!feedOrQuietHours) return false;
        const qh = feedOrQuietHours.quietHours !== undefined
            ? (typeof feedOrQuietHours.quietHours === 'string' ? JSON.parse(feedOrQuietHours.quietHours) : feedOrQuietHours.quietHours)
            : (typeof feedOrQuietHours === 'string' ? JSON.parse(feedOrQuietHours) : feedOrQuietHours);
        if (!qh || !qh.enabled) return false;
        const startStr = qh.start || '23:00';
        const endStr = qh.end || '08:00';

        const [startH, startM] = startStr.split(':').map(Number);
        const [endH, endM] = endStr.split(':').map(Number);

        const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
        const startMinutes = startH * 60 + (startM || 0);
        const endMinutes = endH * 60 + (endM || 0);

        if (startMinutes <= endMinutes) {
            // Plage dans la même journée (ex: 13:00 à 15:00)
            return currentMinutes >= startMinutes && currentMinutes < endMinutes;
        } else {
            // Plage à cheval sur minuit (ex: 23:00 à 08:00)
            return currentMinutes >= startMinutes || currentMinutes < endMinutes;
        }
    }

    /**
     * Indique si les mentions/pings doivent être neutralisés selon les réglages du flux.
     * @param {object} feed
     * @param {Date} [nowDate]
     * @returns {boolean}
     */
    shouldSuppressMentions(feed, nowDate = new Date()) {
        if (!feed || !feed.quietHours) return false;
        const qh = typeof feed.quietHours === 'string' ? JSON.parse(feed.quietHours) : feed.quietHours;
        if (!qh.enabled) return false;
        if (qh.suppressMentions === false) return false;
        return this.isQuietTime(qh, nowDate);
    }

    /**
     * Vérifie et enregistre l'envoi d'un article dans la fenêtre glissante d'1 heure.
     * @param {string} feedId
     * @param {number} maxPostsPerHour
     * @returns {boolean} true si autorisé, false si débit dépassé
     */
    checkRateLimit(feedId, maxPostsPerHour = 0) {
        if (!maxPostsPerHour || maxPostsPerHour <= 0) return true;

        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;

        let timestamps = this.postTimestamps.get(feedId) || [];
        // Nettoyer les envois de plus d'une heure
        timestamps = timestamps.filter(ts => ts > oneHourAgo);

        if (timestamps.length >= maxPostsPerHour) {
            this.postTimestamps.set(feedId, timestamps);
            return false;
        }

        timestamps.push(now);
        this.postTimestamps.set(feedId, timestamps);
        return true;
    }

    /**
     * Réinitialise l'historique de débit pour un flux donné (tests ou force reset).
     * @param {string} feedId
     */
    resetRateLimit(feedId) {
        this.postTimestamps.delete(feedId);
    }
}

module.exports = { AutofeedsRateLimitService };
