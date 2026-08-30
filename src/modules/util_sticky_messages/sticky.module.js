/**
 * src/modules/util_sticky_messages/sticky.module.js
 *
 * Module Sticky Messages (Phase 14 G28).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { StickyRepository } = require('./services/sticky.repository.js');
const { StickyService } = require('./services/sticky.service.js');
const { StickyMessageListener } = require('./events/message-create.listener.js');
const { StickyCommands } = require('./commands/sticky.cmd.js');
const { StickyController } = require('./controllers/sticky.controller.js');

featureRegistry.define('sticky_messages', {
    defaults,
    onEnable: async (guildId) => console.log(`📌 [sticky_messages] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [sticky_messages] disabled on ${guildId}`)
});

class StickyMessagesModule {}

Module({
    providers: [
        StickyRepository,
        StickyService,
        StickyMessagesModule
    ],
    controllers: [StickyController],
    events: [StickyMessageListener],
    commands: [StickyCommands]
})(StickyMessagesModule);

module.exports = { StickyMessagesModule };
