/**
 * temp-voice.module.js — point d'entrée de la feature Vocaux temporaires
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { TempVoiceRepository } = require('./services/temp-voice.repository.js');
const { TempVoiceService } = require('./services/temp-voice.service.js');
const { TempVoiceListener } = require('./events/temp-voice-listener.js');
const { TempVoiceCleanup } = require('./cron/temp-voice-cleanup.js');
const { TempVoiceController } = require('./controllers/temp-voice.controller.js');
const { TempVoiceCommands } = require('./commands/temp-voice-commands.js');

featureRegistry.define('temp-voice', {
    defaults,
    onEnable: async (guildId) => console.log(`🔊 [temp-voice] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [temp-voice] disabled on ${guildId}`)
});

class TempVoiceModule {
    constructor(listener, cleanup) {
        this.listener = listener;
        this.cleanup = cleanup;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client) {
                if (this.listener) this.listener.setClient(client);
                if (this.cleanup) this.cleanup.setClient(client);
            }
        } catch (err) {
            console.warn('[TempVoiceModule] Erreur initialisation Client:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        TempVoiceRepository,
        TempVoiceService,
        TempVoiceListener,
        TempVoiceCleanup,
        TempVoiceModule
    ],
    controllers: [TempVoiceController],
    events: [TempVoiceListener, TempVoiceCleanup],
    commands: [TempVoiceCommands]
})(TempVoiceModule);

module.exports = { TempVoiceModule };
