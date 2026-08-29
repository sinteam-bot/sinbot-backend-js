/**
 * giveaways.module.js — point d'entrée de la feature util_giveaways
 *
 * Issue du split de game_engagement/ (Phase 9.2 du plan migrate-to-c12).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const { GiveawaysRepository } = require('./services/giveaways.repository.js');
const { GiveawayService } = require('./services/giveaway.service.js');
const { GiveawayInteractionListener } = require('./events/message-create.listener.js');
const { GiveawayCron } = require('./events/giveaway-cron.js');
const { GiveawaysController } = require('./controllers/giveaways.controller.js');
const { GiveawayCommands } = require('./commands/giveaway-commands.js');

const defaults = require('./config/defaults.js');

featureRegistry.define('giveaways', {
    defaults: { ...defaults, enabled: defaults.enabled ?? false },
    onEnable: async (guildId) => console.log(`🎉 [giveaways] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [giveaways] disabled on ${guildId}`)
});

class GiveawaysModule {
    constructor() {
        this._repo = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        this._repo = new GiveawaysRepository();
        const service = this._resolve(GiveawayService);
        if (service) service.setRepo(this._repo);
        this._initialized = true;
    }

    _resolve(Class) {
        try {
            const { container } = require('../../core/index.js');
            if (container.has(Class)) return container.resolve(Class);
        } catch (err) {
            console.warn(`[GiveawaysModule] Erreur résolution ${Class?.name || 'classe'}:`, err.message);
        }
        return null;
    }
}

Module({
    providers: [
        GiveawaysRepository,
        GiveawayService,
        GiveawaysModule
    ],
    controllers: [GiveawaysController],
    events: [GiveawayInteractionListener, GiveawayCron],
    commands: [GiveawayCommands]
})(GiveawaysModule);

module.exports = { GiveawaysModule };
