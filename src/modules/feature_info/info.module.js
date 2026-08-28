/**
 * info.module.js — point d'entrée de la feature Info (Phase 8.3)
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { InfoService } = require('./services/info.service.js');
const { InfoController } = require('./controllers/info.controller.js');
const { InfoCommands } = require('./commands/info-commands.js');

featureRegistry.define('info', {
    defaults,
    onEnable: async (guildId) => console.log(`ℹ️ [info] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [info] disabled on ${guildId}`)
});

class InfoModule {
    constructor(info) {
        this.info = info;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client) this.info.setClient(client);
        } catch {}
        this._initialized = true;
    }
}

Module({
    providers: [InfoService, InfoModule],
    controllers: [InfoController],
    commands: [InfoCommands]
})(InfoModule);

module.exports = { InfoModule };
