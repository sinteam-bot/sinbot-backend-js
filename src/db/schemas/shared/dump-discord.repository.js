/**
 * db/schemas/shared/dump-discord.repository.js
 *
 * Repository transverse pour les fonctions de dump Discord
 * (utilisées par `src/dumpDiscord.js`). Réexporte depuis le bridge.
 *
 * Ces fonctions sont isolées du cache normal (qui passe par
 * DiscordCacheService) car le dump est une opération one-shot qui
 * peuple la base en bloc depuis un export Discord.
 */

const { Repository } = require('../../../core/index.js');
const { dumpDiscord } = require('../legacy-bridge.js');

class DumpDiscordRepository {
    constructor() {
        this._bridge = dumpDiscord;
    }

    async saveDumpUser(user) {
        return this._bridge.saveDumpUser(user);
    }

    async saveDumpChannel(channel) {
        return this._bridge.saveDumpChannel(channel);
    }

    async saveDumpThread(thread) {
        return this._bridge.saveDumpThread(thread);
    }

    async saveDumpMessagesBatch(messages) {
        return this._bridge.saveDumpMessagesBatch(messages);
    }
}

Repository()(DumpDiscordRepository);

module.exports = { DumpDiscordRepository };
