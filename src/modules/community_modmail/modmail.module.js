/**
 * src/modules/community_modmail/modmail.module.js
 *
 * Module ModMail (Module P3).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { ModMailRepository } = require('./services/modmail.repository.js');
const { ModMailService } = require('./services/modmail.service.js');
const { ModMailListener } = require('./events/message-create.listener.js');
const { ModMailCommands } = require('./commands/modmail.cmd.js');
const { ModMailController } = require('./controllers/modmail.controller.js');

featureRegistry.define('modmail', {
    defaults,
    onEnable: async (guildId) => console.log(`📬 [modmail] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [modmail] disabled on ${guildId}`)
});

class ModMailModule {}

Module({
    providers: [
        ModMailRepository,
        ModMailService,
        ModMailModule
    ],
    controllers: [ModMailController],
    events: [ModMailListener],
    commands: [ModMailCommands]
})(ModMailModule);

module.exports = { ModMailModule };
