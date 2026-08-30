/**
 * src/modules/util_server_stats/server-stats.module.js
 *
 * Module Server Stats (P5 - Statbot).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { ServerStatsRepository } = require('./services/server-stats.repository.js');
const { ServerStatsService } = require('./services/server-stats.service.js');
const { MemberCountListener } = require('./events/member-count.listener.js');
const { ServerStatsCommands } = require('./commands/server-stats.cmd.js');
const { ServerStatsController } = require('./controllers/server-stats.controller.js');

featureRegistry.define('server_stats', {
    defaults,
    onEnable: async (guildId) => console.log(`📊 [server_stats] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [server_stats] disabled on ${guildId}`)
});

class ServerStatsModule {}

Module({
    providers: [
        ServerStatsRepository,
        ServerStatsService,
        ServerStatsModule
    ],
    controllers: [ServerStatsController],
    events: [MemberCountListener],
    commands: [ServerStatsCommands]
})(ServerStatsModule);

module.exports = { ServerStatsModule };
