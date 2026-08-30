/**
 * src/modules/util_autofeeds/autofeeds.module.js
 *
 * Module Flux automatiques RSS/Atom (Phase 14 G23).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { AutofeedsRepository } = require('./services/autofeeds.repository.js');
const { AutofeedsService } = require('./services/autofeeds.service.js');
const { AutofeedCommands } = require('./commands/autofeed.cmd.js');
const { AutofeedsController } = require('./controllers/autofeeds.controller.js');

featureRegistry.define('autofeeds', {
    defaults,
    onEnable: async (guildId) => console.log(`📰 [autofeeds] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [autofeeds] disabled on ${guildId}`)
});

class AutofeedsModule {
    constructor(service) {
        this.service = service;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client && this.service) {
                this.service.start(client);
            }
        } catch (err) {
            console.warn('[AutofeedsModule] Erreur init timer:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        AutofeedsRepository,
        AutofeedsService,
        AutofeedsModule
    ],
    controllers: [AutofeedsController],
    commands: [AutofeedCommands]
})(AutofeedsModule);

module.exports = { AutofeedsModule };
