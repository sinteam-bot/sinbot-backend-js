/**
 * feature_info/info.repository.js
 *
 * Repository du module Info. Réexporte les fonctions bot-state du bridge
 * (getBotState / setBotState) tant qu'elles ne sont pas portées en Drizzle.
 *
 * Note : le module `feature_info` n'a pas de tables propres ; il consomme
 * le schéma transverse `db/schemas/shared/bot-info.js` (botVersionState).
 */

const { Repository } = require('../../core/index.js');
const { botState } = require('../../db/legacy-bridge.js');

class InfoRepository {
    constructor() {
        this._bridge = botState;
    }

    async getBotState(key) {
        return this._bridge.getBotState(key);
    }

    async setBotState(key, value) {
        return this._bridge.setBotState(key, value);
    }
}

Repository()(InfoRepository);

module.exports = { InfoRepository };
