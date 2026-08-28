/**
 * feature_welcome/welcome.repository.js
 *
 * Repository du module Welcome. Réexporte les fonctions legacy de
 * `db/legacy-bridge.js.welcome` tant qu'elles ne sont pas portées
 * en Drizzle natif (cf. critère 7 du plan db-repository-split).
 *
 * Fonctions exposées (via bridge) :
 *   - getWelcomeConfig(guildId)
 *   - saveWelcomeConfig(guildId, channelId, message, autoRoles, isEnabled)
 */

const { Repository } = require('../../core/index.js');
const { welcome: welcomeBridge } = require('../../db/legacy-bridge.js');

class WelcomeRepository {
    constructor() {
        this._bridge = welcomeBridge;
    }

    async getWelcomeConfig(guildId) {
        return this._bridge.getWelcomeConfig(guildId);
    }

    async saveWelcomeConfig(guildId, welcomeChannelId, welcomeMessage, autoRoles = [], isEnabled = 1) {
        return this._bridge.saveWelcomeConfig(guildId, welcomeChannelId, welcomeMessage, autoRoles, isEnabled);
    }
}

Repository()(WelcomeRepository);

module.exports = { WelcomeRepository };
