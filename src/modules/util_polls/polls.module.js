/**
 * polls.module.js — point d'entrée de la feature util_polls
 *
 * Issue du split de game_engagement/ (Phase 9.2 du plan migrate-to-c12).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const { PollsRepository } = require('./services/polls.repository.js');
const { PollService } = require('./services/poll.service.js');
const { PollInteractionListener } = require('./events/message-create.listener.js');
const { PollsController } = require('./controllers/polls.controller.js');
const { PollCommands } = require('./commands/poll-commands.js');

const defaults = require('./config/defaults.js');

featureRegistry.define('polls', {
    defaults: { ...defaults, enabled: defaults.enabled ?? false },
    onEnable: async (guildId) => console.log(`📊 [polls] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [polls] disabled on ${guildId}`)
});

class PollsModule {
    constructor() {
        this._repo = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        this._repo = new PollsRepository();
        const service = this._resolve(PollService);
        if (service) service.setRepo(this._repo);
        this._initialized = true;
    }

    _resolve(Class) {
        try {
            const { container } = require('../../core/index.js');
            if (container.has(Class)) return container.resolve(Class);
        } catch (err) {
            console.warn(`[PollsModule] Erreur résolution ${Class?.name || 'classe'}:`, err.message);
        }
        return null;
    }
}

Module({
    providers: [
        PollsRepository,
        PollService,
        PollsModule
    ],
    controllers: [PollsController],
    events: [PollInteractionListener],
    commands: [PollCommands]
})(PollsModule);

module.exports = { PollsModule };
