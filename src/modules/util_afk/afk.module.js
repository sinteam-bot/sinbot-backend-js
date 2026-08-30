/**
 * src/modules/util_afk/afk.module.js
 *
 * Module Système AFK (Phase 9 G06).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { AfkRepository } = require('./services/afk.repository.js');
const { AfkService } = require('./services/afk.service.js');
const { AfkMessageListener } = require('./events/afk-message.listener.js');
const { AfkCommands } = require('./commands/afk.cmd.js');

featureRegistry.define('afk', {
    defaults,
    onEnable: async (guildId) => console.log(`💤 [afk] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [afk] disabled on ${guildId}`)
});

class AfkModule {}

Module({
    providers: [
        AfkRepository,
        AfkService,
        AfkModule
    ],
    events: [AfkMessageListener],
    commands: [AfkCommands]
})(AfkModule);

module.exports = { AfkModule };
