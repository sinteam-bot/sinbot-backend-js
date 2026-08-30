/**
 * src/modules/community_suggestions/suggestions.module.js
 *
 * Module Suggestions (Phase 7 G12).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { SuggestionsRepository } = require('./services/suggestions.repository.js');
const { SuggestionsService } = require('./services/suggestions.service.js');
const { SuggestionsListener } = require('./events/suggestions.event.js');
const { SuggestionsController } = require('./controllers/suggestions.controller.js');
const { SuggestionsCommands } = require('./commands/suggestions.cmd.js');

featureRegistry.define('suggestions', {
    defaults,
    onEnable: async (guildId) => console.log(`💡 [suggestions] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [suggestions] disabled on ${guildId}`)
});

class SuggestionsModule {
    constructor(listener) {
        this.listener = listener;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client && this.listener) this.listener.setClient(client);
        } catch (err) {
            console.warn('[SuggestionsModule] Erreur initialisation Client:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        SuggestionsRepository,
        SuggestionsService,
        SuggestionsListener,
        SuggestionsModule
    ],
    controllers: [SuggestionsController],
    events: [SuggestionsListener],
    commands: [SuggestionsCommands]
})(SuggestionsModule);

module.exports = { SuggestionsModule };
