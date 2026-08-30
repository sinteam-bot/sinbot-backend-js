/**
 * src/modules/automation_autothread/autothread.module.js
 *
 * Module Auto-Thread (Module P2).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { AutoThreadRepository } = require('./services/autothread.repository.js');
const { AutoThreadService } = require('./services/autothread.service.js');
const { AutoThreadListener } = require('./events/message-create.listener.js');
const { ThreadCommands } = require('./commands/thread.cmd.js');
const { AutoThreadController } = require('./controllers/autothread.controller.js');

featureRegistry.define('autothread', {
    defaults,
    onEnable: async (guildId) => console.log(`🧵 [autothread] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [autothread] disabled on ${guildId}`)
});

class AutoThreadModule {}

Module({
    providers: [
        AutoThreadRepository,
        AutoThreadService,
        AutoThreadModule
    ],
    controllers: [AutoThreadController],
    events: [AutoThreadListener],
    commands: [ThreadCommands]
})(AutoThreadModule);

module.exports = { AutoThreadModule };
