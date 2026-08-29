/**
 * engagement.module.js — point d'entrée de la feature Giveaways & Polls
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { EngagementRepository } = require('./services/engagement.repository.js');
const { GiveawayService } = require('./services/giveaway.service.js');
const { PollService } = require('./services/poll.service.js');
const { EngagementInteractionListener } = require('./events/interaction-create.listener.js');
const { EngagementCron } = require('./events/engagement-cron.js');
const { GiveawaysController, PollsController } = require('./controllers/engagement.controller.js');

featureRegistry.define('engagement', {
    defaults,
    onEnable: async (guildId) => console.log(`🎉 [engagement] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [engagement] disabled on ${guildId}`)
});

class EngagementModule {
    constructor() {
        this._repo = null;
        this._initialized = false;
    }

    /**
     * Branchement tardif du repository partagé
     * (les services sont instanciés avant que le module ne le soit)
     */
    init() {
        if (this._initialized) return;
        this._repo = new EngagementRepository();
        const giveaway = this._resolve(GiveawayService);
        const poll = this._resolve(PollService);
        if (giveaway) giveaway.setRepo(this._repo);
        if (poll) poll.setRepo(this._repo);
        this._initialized = true;
    }

    _resolve(Class) {
        try {
            const { container } = require('../../core/index.js');
            if (container.has(Class)) return container.resolve(Class);
        } catch (err) {
            console.warn(`[EngagementModule] Erreur résolution ${Class?.name || 'classe'}:`, err.message);
        }
        return null;
    }
}

Module({
    providers: [
        EngagementRepository,
        GiveawayService,
        PollService,
        EngagementModule
    ],
    controllers: [
        GiveawaysController,
        PollsController
    ],
    events: [
        EngagementInteractionListener,
        EngagementCron
    ]
})(EngagementModule);

module.exports = { EngagementModule };
