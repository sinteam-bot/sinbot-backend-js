/**
 * notifier_startup/startup.repository.js
 *
 * Repository du service Startup Notifier. Réexporte les fonctions
 * bot-state (getBotState / setBotState) depuis le bridge.
 */

const { Repository } = require('../../core/index.js');
const { botState } = require('../../db/legacy-bridge.js');

class StartupRepository {
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

Repository()(StartupRepository);

module.exports = { StartupRepository };
