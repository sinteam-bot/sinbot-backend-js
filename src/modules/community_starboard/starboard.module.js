/**
 * src/modules/community_starboard/starboard.module.js
 *
 * Module Starboard (Phase 7 G05).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { StarboardRepository } = require('./services/starboard.repository.js');
const { StarboardService } = require('./services/starboard.service.js');
const { StarboardListener } = require('./events/starboard.event.js');
const { StarboardController } = require('./controllers/starboard.controller.js');
const { StarboardCommands } = require('./commands/starboard.cmd.js');

featureRegistry.define('starboard', {
    defaults,
    onEnable: async (guildId) => console.log(`⭐ [starboard] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [starboard] disabled on ${guildId}`)
});

class StarboardModule {
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
            console.warn('[StarboardModule] Erreur initialisation Client:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        StarboardRepository,
        StarboardService,
        StarboardListener,
        StarboardModule
    ],
    controllers: [StarboardController],
    events: [StarboardListener],
    commands: [StarboardCommands]
})(StarboardModule);

module.exports = { StarboardModule };
