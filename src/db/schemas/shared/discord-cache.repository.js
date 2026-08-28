/**
 * db/schemas/shared/discord-cache.repository.js
 *
 * Repository transverse pour le cache des entités Discord.
 * Réexporte les fonctions legacy de `db/legacy-bridge.js.discordCache`.
 *
 * Utilisé par : DiscordCacheService, dumpDiscord, events Discord.
 */

const { Repository } = require('../../../core/index.js');
const { discordCache } = require('../legacy-bridge.js');

class DiscordCacheRepository {
    constructor() {
        this._bridge = discordCache;
    }

    async upsertDiscordChannel(channel) {
        return this._bridge.upsertDiscordChannel(channel);
    }

    async deleteDiscordChannel(channelId) {
        return this._bridge.deleteDiscordChannel(channelId);
    }

    async upsertDiscordRole(role) {
        return this._bridge.upsertDiscordRole(role);
    }

    async deleteDiscordRole(roleId) {
        return this._bridge.deleteDiscordRole(roleId);
    }

    async upsertDiscordThread(thread) {
        return this._bridge.upsertDiscordThread(thread);
    }

    async deleteDiscordThread(threadId) {
        return this._bridge.deleteDiscordThread(threadId);
    }

    async updateDiscordMessage(message) {
        return this._bridge.updateDiscordMessage(message);
    }

    async deleteDiscordMessage(messageId) {
        return this._bridge.deleteDiscordMessage(messageId);
    }
}

Repository()(DiscordCacheRepository);

module.exports = { DiscordCacheRepository };
