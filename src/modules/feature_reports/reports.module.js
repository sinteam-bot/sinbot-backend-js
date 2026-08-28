/**
 * reports.module.js — point d'entrée de la feature Signalements (Phase 12)
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { ReportsRepository } = require('./services/reports.repository.js');
const { ReportsService } = require('./services/reports.service.js');
const { ReportsListener } = require('./events/reports-listener.js');
const { ReportsController } = require('./controllers/reports.controller.js');
const { ReportsCommands } = require('./commands/reports-commands.js');

featureRegistry.define('reports', {
    defaults,
    onEnable: async (guildId) => console.log(`🚩 [reports] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [reports] disabled on ${guildId}`)
});

class ReportsModule {
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
        } catch {}
        this._initialized = true;
    }
}

Module({
    providers: [
        ReportsRepository,
        ReportsService,
        ReportsListener,
        ReportsModule
    ],
    controllers: [ReportsController],
    events: [ReportsListener],
    commands: [ReportsCommands]
})(ReportsModule);

module.exports = { ReportsModule };
