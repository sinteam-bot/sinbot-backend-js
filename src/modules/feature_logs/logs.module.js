/**
 * logs.module.js — point d'entrée de la feature Logs & Stats (Phase 4)
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { LogsService } = require('./services/logs.service.js');
const { StatsService } = require('./services/stats.service.js');
const { LogsListeners } = require('./events/logs-listeners.js');
const { LogsController } = require('./controllers/logs.controller.js');
const { StatsController } = require('./controllers/stats.controller.js');

featureRegistry.define('logs', {
    defaults,
    onEnable: async (guildId) => console.log(`📜 [logs] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [logs] disabled on ${guildId}`)
});

class LogsModule { }

Module({
    providers: [LogsService, StatsService],
    controllers: [LogsController, StatsController],
    events: [LogsListeners]
})(LogsModule);

module.exports = { LogsModule };
