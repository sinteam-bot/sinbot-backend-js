/**
 * db/schemas/shared/openai.repository.js
 *
 * Repository transverse pour les opérations OpenAI (saveOpenAIMessage,
 * getLastOpenAIMessageId). Réexporte depuis le bridge tant que le
 * feature `feature_daily-message` n'a pas porté ces fonctions en
 * Drizzle natif.
 *
 * Le schéma associé (`openaimessages` table) est défini dans
 * `db/schemas/shared/openai.js`.
 */

const { Repository } = require('../../../core/index.js');
const { openai } = require('../legacy-bridge.js');

class OpenAIRepository {
    constructor() {
        this._bridge = openai;
    }

    async saveOpenAIMessage(data) {
        return this._bridge.saveOpenAIMessage(data);
    }

    async getLastOpenAIMessageId() {
        return this._bridge.getLastOpenAIMessageId();
    }
}

Repository()(OpenAIRepository);

module.exports = { OpenAIRepository };
