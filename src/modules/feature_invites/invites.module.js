/**
 * feature_invites/invites.module.js — point d'entrée de la feature Invites
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const schema = require('./config/schema.js');
const { InvitesRepository } = require('./invites.repository.js');
const { InvitesService } = require('./services/invites.service.js');
const { InvitesListener } = require('./events/invites-listener.js');
const { InvitesController } = require('./controllers/invites.controller.js');
const { InviteCommands } = require('./commands/invite-commands.js');

featureRegistry.define('invites', {
    defaults,
    configSchema: schema,
    onEnable: async (guildId) => console.log(`🎟️ [invites] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [invites] disabled on ${guildId}`)
});

class InvitesModule {
    constructor(listener) {
        this.listener = listener;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client && this.listener) this.listener.setClient(client);
        } catch (err) {
            console.warn('[InvitesModule] init Client:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        InvitesRepository,
        InvitesService,
        InvitesListener,
        InvitesModule
    ],
    controllers: [InvitesController],
    events: [InvitesListener],
    commands: [InviteCommands]
})(InvitesModule);

module.exports = { InvitesModule };
