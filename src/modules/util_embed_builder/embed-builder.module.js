/**
 * src/modules/util_embed_builder/embed-builder.module.js
 *
 * Module Message Embedder Persistant (Phase 12 G40).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { EmbedBuilderRepository } = require('./services/embed-builder.repository.js');
const { EmbedBuilderService } = require('./services/embed-builder.service.js');
const { EmbedBuilderCommands } = require('./commands/embed-builder.cmd.js');
const { EmbedBuilderController } = require('./controllers/embed-builder.controller.js');

featureRegistry.define('embed_builder', {
    defaults,
    onEnable: async (guildId) => console.log(`📜 [embed_builder] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [embed_builder] disabled on ${guildId}`)
});

class EmbedBuilderModule {}

Module({
    providers: [
        EmbedBuilderRepository,
        EmbedBuilderService,
        EmbedBuilderModule
    ],
    controllers: [EmbedBuilderController],
    commands: [EmbedBuilderCommands]
})(EmbedBuilderModule);

module.exports = { EmbedBuilderModule };
