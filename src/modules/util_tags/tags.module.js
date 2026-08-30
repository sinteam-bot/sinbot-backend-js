/**
 * src/modules/util_tags/tags.module.js
 *
 * Module Système de Tags (Phase 9 G41).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { TagsRepository } = require('./services/tags.repository.js');
const { TagsService } = require('./services/tags.service.js');
const { TagPrefixListener } = require('./events/tag-prefix.listener.js');
const { TagsCommands } = require('./commands/tags.cmd.js');
const { TagsController } = require('./controllers/tags.controller.js');

featureRegistry.define('tags', {
    defaults,
    onEnable: async (guildId) => console.log(`🏷️ [tags] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [tags] disabled on ${guildId}`)
});

class TagsModule {}

Module({
    providers: [
        TagsRepository,
        TagsService,
        TagsModule
    ],
    controllers: [TagsController],
    events: [TagPrefixListener],
    commands: [TagsCommands]
})(TagsModule);

module.exports = { TagsModule };
