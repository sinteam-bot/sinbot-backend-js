/**
 * src/modules/util_highlights/highlights.module.js
 *
 * Module Highlights (Phase 14 G22).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { HighlightsRepository } = require('./services/highlights.repository.js');
const { HighlightsService } = require('./services/highlights.service.js');
const { HighlightsMessageListener } = require('./events/message-create.listener.js');
const { HighlightCommands } = require('./commands/highlight.cmd.js');
const { HighlightsController } = require('./controllers/highlights.controller.js');

featureRegistry.define('highlights', {
    defaults,
    onEnable: async (guildId) => console.log(`🔔 [highlights] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [highlights] disabled on ${guildId}`)
});

class HighlightsModule {}

Module({
    providers: [
        HighlightsRepository,
        HighlightsService,
        HighlightsModule
    ],
    controllers: [HighlightsController],
    events: [HighlightsMessageListener],
    commands: [HighlightCommands]
})(HighlightsModule);

module.exports = { HighlightsModule };
