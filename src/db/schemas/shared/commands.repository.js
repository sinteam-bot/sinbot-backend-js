/**
 * db/schemas/shared/commands.repository.js
 *
 * Repository transverse pour les commandes "globales" non rattachées à un
 * module particulier (ex. confirm_member, choose_member). Réexporte
 * `addGrognement` / `getMemberForGrognement` depuis le bridge.
 *
 * Le schéma associé (`grognement` table) est défini dans
 * `db/schemas/shared/cache.js`.
 */

const { Repository } = require('../../../core/index.js');
const { commands } = require('../legacy-bridge.js');

class CommandsRepository {
    constructor() {
        this._bridge = commands;
    }

    async addGrognement(userId, username) {
        return this._bridge.addGrognement(userId, username);
    }

    async getMemberForGrognement() {
        return this._bridge.getMemberForGrognement();
    }
}

Repository()(CommandsRepository);

module.exports = { CommandsRepository };
