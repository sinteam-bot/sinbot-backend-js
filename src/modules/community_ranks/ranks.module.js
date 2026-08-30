/**
 * src/modules/community_ranks/ranks.module.js
 *
 * Module Ranks (Phase 10 G26).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { RanksRepository } = require('./services/ranks.repository.js');
const { RanksService } = require('./services/ranks.service.js');
const { RanksCommands } = require('./commands/ranks.cmd.js');
const { RanksController } = require('./controllers/ranks.controller.js');

featureRegistry.define('ranks', {
    defaults,
    onEnable: async (guildId) => console.log(`🎖️ [ranks] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [ranks] disabled on ${guildId}`)
});

class RanksModule {}

Module({
    providers: [
        RanksRepository,
        RanksService,
        RanksModule
    ],
    controllers: [RanksController],
    commands: [RanksCommands]
})(RanksModule);

module.exports = { RanksModule };
