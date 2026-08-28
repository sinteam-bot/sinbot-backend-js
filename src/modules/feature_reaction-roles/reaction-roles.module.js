/**
 * reaction-roles.module.js — point d'entrée de la feature Reaction Roles (Phase RR)
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { ReactionRolesRepository } = require('./services/reaction-roles.repository.js');
const { ReactionRolesService } = require('./services/reaction-roles.service.js');
const { ReactionListener } = require('./events/reaction-listener.js');
const { ReactionRoleCommands } = require('./commands/reaction-commands.js');
const { ReactionRolesController } = require('./controllers/reaction-roles.controller.js');

featureRegistry.define('reaction-roles', {
    defaults,
    onEnable: async (guildId) => console.log(`🎭 [reaction-roles] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [reaction-roles] disabled on ${guildId}`)
});

class ReactionRolesModule {
    constructor() {
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;
    }
}

Module({
    providers: [
        ReactionRolesRepository,
        ReactionRolesService,
        ReactionRolesModule
    ],
    controllers: [ReactionRolesController],
    events: [ReactionListener],
    commands: [ReactionRoleCommands]
})(ReactionRolesModule);

module.exports = { ReactionRolesModule };
