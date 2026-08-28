/**
 * db/schemas/shared/members.repository.js
 *
 * Repository transverse pour la gestion des membres (historique, rôles, etc.).
 * Réexporte les fonctions legacy de `db/legacy-bridge.js.members` tant
 * qu'elles ne sont pas portées en Drizzle natif.
 *
 * Utilisé par : DiscordCacheService, events/messageCreate, modules logs.
 */

const { Repository } = require('../../../core/index.js');
const { members } = require('../legacy-bridge.js');

class MembersRepository {
    constructor() {
        this._bridge = members;
    }

    async registerNewMember(memberData) {
        return this._bridge.registerNewMember(memberData);
    }

    async logMemberEvent(userId, username, action, guildId, metadata = {}) {
        return this._bridge.logMemberEvent(userId, username, action, guildId, metadata);
    }

    async updateMemberRoles(userId, roles) {
        return this._bridge.updateMemberRoles(userId, roles);
    }

    async markMemberLeft(userId, username, guildId) {
        return this._bridge.markMemberLeft(userId, username, guildId);
    }

    async getMemberInfo(userId) {
        return this._bridge.getMemberInfo(userId);
    }

    async getRecentMembers(limit = 20) {
        return this._bridge.getRecentMembers(limit);
    }

    async getMemberHistory(userId, limit = 50) {
        return this._bridge.getMemberHistory(userId, limit);
    }

    async addGuildMember(userId, username) {
        return this._bridge.addGuildMember(userId, username);
    }
}

Repository()(MembersRepository);

module.exports = { MembersRepository };
