/**
 * src/modules/util_afk/services/afk.service.js
 *
 * Service métier pour le statut AFK (Phase 9 G06).
 */

const { Injectable } = require('../../../core/index.js');
const { AfkRepository } = require('./afk.repository.js');

class AfkService {
    static inject = [AfkRepository];

    constructor(repo) {
        this.repo = repo;
    }

    async setAfk(guildId, userId, reason = null) {
        return this.repo.setAfk(guildId, userId, reason);
    }

    async getAfk(guildId, userId) {
        return this.repo.getAfk(guildId, userId);
    }

    async clearAfk(guildId, userId) {
        return this.repo.clearAfk(guildId, userId);
    }

    async listAfk(guildId) {
        return this.repo.listAfk(guildId);
    }
}

Injectable()(AfkService);

module.exports = { AfkService };
