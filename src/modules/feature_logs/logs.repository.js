/**
 * feature_logs/logs.repository.js
 *
 * Repository composite du module Logs. Agrège les repositories transverses
 * (audit, members, discord-cache) car le module logs est transverse par
 * nature (il observe tous les autres modules).
 */

const { Repository } = require('../../core/index.js');
const { AuditRepository } = require('../../db/schemas/shared/audit.repository.js');
const { MembersRepository } = require('../../db/schemas/shared/members.repository.js');
const { DiscordCacheRepository } = require('../../db/schemas/shared/discord-cache.repository.js');

class LogsRepository {
    constructor() {
        this._audit = new AuditRepository();
        this._members = new MembersRepository();
        this._cache = new DiscordCacheRepository();
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
