/**
 * src/modules/util_timers/timers.module.js
 *
 * Module Minuteries & Rappers Timers (Phase 14 G24).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { TimersRepository } = require('./services/timers.repository.js');
const { TimersService } = require('./services/timers.service.js');
const { TimerCommands } = require('./commands/timer.cmd.js');
const { TimersController } = require('./controllers/timers.controller.js');

featureRegistry.define('timers', {
    defaults,
    onEnable: async (guildId) => console.log(`⏰ [timers] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [timers] disabled on ${guildId}`)
});

class TimersModule {
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
            console.warn('[TimersModule] Erreur init timer:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        TimersRepository,
        TimersService,
        TimersModule
    ],
    controllers: [TimersController],
    commands: [TimerCommands]
})(TimersModule);

module.exports = { TimersModule };
