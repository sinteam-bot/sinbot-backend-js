/**
 * sticky-roles.module.js — point d'entrée de la feature Sticky Roles (Phase 8)
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { StickyRolesRepository } = require('./services/sticky-roles.repository.js');
const { StickyRolesService } = require('./services/sticky-roles.service.js');
const { StickyRolesListener } = require('./events/sticky-roles-listener.js');
const { StickyRoleCommands } = require('./commands/sticky-role-commands.js');
const { StickyRolesController } = require('./controllers/sticky-roles.controller.js');

featureRegistry.define('sticky-roles', {
    defaults,
    onEnable: async (guildId) => console.log(`🎭 [sticky-roles] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [sticky-roles] disabled on ${guildId}`)
});

class StickyRolesModule {
    constructor(service) {
        this.service = service;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client && this.service) this.service.setClient(client);
        } catch (err) {
            console.warn('[StickyRolesModule] Erreur initialisation Client:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        StickyRolesRepository,
        StickyRolesService,
        StickyRolesModule
    ],
    controllers: [StickyRolesController],
    events: [StickyRolesListener],
    commands: [StickyRoleCommands]
})(StickyRolesModule);

module.exports = { StickyRolesModule };
