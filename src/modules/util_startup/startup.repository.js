/**
 * notifier_startup/startup.repository.js
 *
 * Repository du service Startup Notifier. Délègue à `BotStateRepository`
 * (transverse) pour l'état runtime.
 */

const { Repository } = require('../../core/index.js');
const { BotStateRepository } = require('../../db/schemas/shared/bot-state.repository.js');

class StartupRepository {
    constructor() {
        this._botState = new BotStateRepository();
    }

    async getBotState(key) {
        return this._botState.getBotState(key);
    }

    async setBotState(key, value) {
        return this._botState.setBotState(key, value);
    }
}

Repository()(StartupRepository);

module.exports = { StartupRepository };
