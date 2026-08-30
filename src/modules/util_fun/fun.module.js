/**
 * src/modules/util_fun/fun.module.js
 *
 * Module Fun & Transformations (Phase 9 G04, G27).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { FunService } = require('./services/fun.service.js');
const { FunController } = require('./controllers/fun.controller.js');
const { FunCommands } = require('./commands/fun.cmd.js');

featureRegistry.define('fun', {
    defaults,
    onEnable: async (guildId) => console.log(`🎉 [fun] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [fun] disabled on ${guildId}`)
});

class FunModule {}

Module({
    providers: [
        FunService,
        FunModule
    ],
    controllers: [FunController],
    commands: [FunCommands]
})(FunModule);

module.exports = { FunModule };
