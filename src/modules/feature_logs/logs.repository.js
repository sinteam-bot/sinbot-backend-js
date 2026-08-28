/**
 * feature_logs/logs.repository.js
 *
 * Repository du module Logs. Réexporte les fonctions transverses du
 * bridge (audit + members + discordCache) tant qu'elles ne sont pas
 * portées en Drizzle natif.
 *
 * Le module logs consomme :
 *   - `audit` : archive d'événements Discord
 *   - `members` : historique des membres
 *   - `discordCache` : cache des entités Discord
 */

const { Repository } = require('../../core/index.js');
const { audit, members, discordCache } = require('../../db/legacy-bridge.js');

class LogsRepository {
    constructor() {
        this._audit = audit;
        this._members = members;
        this._cache = discordCache;
    }

    // --- audit ---
    async archiveDiscordEvent(eventName, payload = {}) {
        return this._audit.archiveDiscordEvent(eventName, payload);
    }

    async getDiscordEventsArchive(options = {}) {
        return this._audit.getDiscordEventsArchive(options);
    }

    async getGlobalStats() {
        return this._audit.getGlobalStats();
    }

    // --- members ---
    async registerNewMember(memberData) {
        return this._members.registerNewMember(memberData);
    }

    async logMemberEvent(userId, username, action, guildId, metadata = {}) {
        return this._members.logMemberEvent(userId, username, action, guildId, metadata);
    }

    async updateMemberRoles(userId, roles) {
        return this._members.updateMemberRoles(userId, roles);
    }

    async markMemberLeft(userId, username, guildId) {
        return this._members.markMemberLeft(userId, username, guildId);
    }

    async getMemberInfo(userId) {
        return this._members.getMemberInfo(userId);
    }

    async getRecentMembers(limit = 20) {
        return this._members.getRecentMembers(limit);
    }

    async getMemberHistory(userId, limit = 50) {
        return this._members.getMemberHistory(userId, limit);
    }

    // --- discord cache ---
    async upsertDiscordChannel(channel) {
        return this._cache.upsertDiscordChannel(channel);
    }

    async deleteDiscordChannel(channelId) {
        return this._cache.deleteDiscordChannel(channelId);
    }

    async upsertDiscordRole(role) {
        return this._cache.upsertDiscordRole(role);
    }

    async deleteDiscordRole(roleId) {
        return this._cache.deleteDiscordRole(roleId);
    }

    async upsertDiscordThread(thread) {
        return this._cache.upsertDiscordThread(thread);
    }

    async deleteDiscordThread(threadId) {
        return this._cache.deleteDiscordThread(threadId);
    }

    async updateDiscordMessage(message) {
        return this._cache.updateDiscordMessage(message);
    }

    async deleteDiscordMessage(messageId) {
        return this._cache.deleteDiscordMessage(messageId);
    }
}

Repository()(LogsRepository);

module.exports = { LogsRepository };
