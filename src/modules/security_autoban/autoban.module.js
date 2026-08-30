/**
 * src/modules/security_autoban/autoban.module.js
 *
 * Module Autoban (Phase 11 G17).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { AutobanRepository } = require('./services/autoban.repository.js');
const { AutobanService } = require('./services/autoban.service.js');
const { AutobanMemberListener } = require('./events/autoban-member.listener.js');
const { AutobanCommands } = require('./commands/autoban.cmd.js');
const { AutobanController } = require('./controllers/autoban.controller.js');

featureRegistry.define('autoban', {
    defaults,
    onEnable: async (guildId) => console.log(`🛡️ [autoban] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [autoban] disabled on ${guildId}`)
});

class AutobanModule {}

Module({
    providers: [
        AutobanRepository,
        AutobanService,
        AutobanModule
    ],
    controllers: [AutobanController],
    events: [AutobanMemberListener],
    commands: [AutobanCommands]
})(AutobanModule);

module.exports = { AutobanModule };
