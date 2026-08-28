/**
 * db/schemas/shared/audit.repository.js
 *
 * Repository transverse pour l'audit et la télémétrie du bot.
 * Réexporte les fonctions legacy de `db/legacy-bridge.js.audit` tant
 * qu'elles ne sont pas portées en Drizzle natif (cf. critère 7 du plan).
 *
 * Fonctions exposées :
 *   - logUserEvent(userId, username, eventType, eventData)
 *   - getUserEvents(userId, limit)
 *   - saveFormResponse(userId, username, formName, responses)
 *   - getGlobalStats()
 *   - archiveDiscordEvent(eventName, payload)
 *   - getDiscordEventsArchive(options)
 */

const { Repository } = require('../../../core/index.js');
const { audit } = require('../legacy-bridge.js');

class AuditRepository {
    constructor() {
        this._bridge = audit;
    }

    async logUserEvent(userId, username, eventType, eventData = null) {
        return this._bridge.logUserEvent(userId, username, eventType, eventData);
    }

    async getUserEvents(userId, limit = 50) {
        return this._bridge.getUserEvents(userId, limit);
    }

    async saveFormResponse(userId, username, formName, responses) {
        return this._bridge.saveFormResponse(userId, username, formName, responses);
    }

    async getGlobalStats() {
        return this._bridge.getGlobalStats();
    }

    async archiveDiscordEvent(eventName, payload = {}) {
        return this._bridge.archiveDiscordEvent(eventName, payload);
    }

    async getDiscordEventsArchive(options = {}) {
        return this._bridge.getDiscordEventsArchive(options);
    }
}

Repository()(AuditRepository);

module.exports = { AuditRepository };
