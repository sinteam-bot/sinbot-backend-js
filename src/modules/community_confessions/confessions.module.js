/**
 * src/modules/community_confessions/confessions.module.js
 *
 * Module Confessions Anonymes (Module P1).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { ConfessionsRepository } = require('./services/confessions.repository.js');
const { ConfessionsService } = require('./services/confessions.service.js');
const { ConfessCommands } = require('./commands/confess.cmd.js');
const { ConfessionsController } = require('./controllers/confessions.controller.js');
const { ConfessionInteractionListener } = require('./events/interaction-create.listener.js');

featureRegistry.define('confessions', {
    defaults,
    onEnable: async (guildId) => console.log(`💬 [confessions] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [confessions] disabled on ${guildId}`)
});

class ConfessionsModule {}

Module({
    providers: [
        ConfessionsRepository,
        ConfessionsService,
        ConfessionsModule
    ],
    events: [ConfessionInteractionListener],
    controllers: [ConfessionsController],
    commands: [ConfessCommands]
})(ConfessionsModule);

module.exports = { ConfessionsModule };
