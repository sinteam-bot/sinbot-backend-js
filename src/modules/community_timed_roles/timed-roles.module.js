/**
 * src/modules/community_timed_roles/timed-roles.module.js
 *
 * Module Timed Roles (Phase 10 G07).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { TimedRolesRepository } = require('./services/timed-roles.repository.js');
const { TimedRolesService } = require('./services/timed-roles.service.js');
const { TimedRolesCommands } = require('./commands/timed-roles.cmd.js');

featureRegistry.define('timed_roles', {
    defaults,
    onEnable: async (guildId) => console.log(`⏳ [timed_roles] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [timed_roles] disabled on ${guildId}`)
});

class TimedRolesModule {
    constructor(service) {
        this.service = service;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client && this.service) {
                this.service.start(client);
            }
        } catch (err) {
            console.warn('[TimedRolesModule] Erreur initialisation:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        TimedRolesRepository,
        TimedRolesService,
        TimedRolesModule
    ],
    commands: [TimedRolesCommands]
})(TimedRolesModule);

module.exports = { TimedRolesModule };
