/**
 * feature_info/info.repository.js
 *
 * Repository du module Info. Délègue à `BotStateRepository` (transverse)
 * pour l'état runtime du bot.
 *
 * Le module `feature_info` n'a pas de tables propres ; il consomme le
 * schéma transverse `db/schemas/shared/bot-info.js` (botVersionState)
 * via le BotStateRepository.
 */

const { Repository } = require('../../core/index.js');
const { BotStateRepository } = require('../../db/schemas/shared/bot-state.repository.js');

class InfoRepository {
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

Repository()(InfoRepository);

module.exports = { InfoRepository };
