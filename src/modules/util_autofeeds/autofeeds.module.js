/**
 * src/modules/util_autofeeds/autofeeds.module.js
 *
 * Module Flux automatiques RSS, LootScraper, multi-sources & souscriptions d'alertes.
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { AutofeedsRepository } = require('./services/autofeeds.repository.js');
const { AutofeedsSubscriptionService } = require('./services/autofeeds-subscription.service.js');
const { AutofeedsWebhookService } = require('./services/autofeeds-webhook.service.js');
const { AutofeedsAiService } = require('./services/autofeeds-ai.service.js');
const { AutofeedsOpmlService } = require('./services/autofeeds-opml.service.js');
const { AutofeedsGamificationService } = require('./services/autofeeds-gamification.service.js');
const { AutofeedsRateLimitService } = require('./services/autofeeds-ratelimit.service.js');
const { AutofeedsDigestService } = require('./services/autofeeds-digest.service.js');
const { AutofeedsPulseService } = require('./services/autofeeds-pulse.service.js');
const { AutofeedsClusteringService } = require('./services/autofeeds-clustering.service.js');
const { AutofeedsPurgeService } = require('./services/autofeeds-purge.service.js');
const { AutofeedsAudioService } = require('./services/autofeeds-audio.service.js');
const { AutofeedsService } = require('./services/autofeeds.service.js');
const { AutofeedCommands } = require('./commands/autofeed.cmd.js');
const { AutofeedsController, AutofeedsWebhooksController } = require('./controllers/autofeeds.controller.js');
const { AutofeedInteractionListener } = require('./events/autofeed-interaction.listener.js');

featureRegistry.define('autofeeds', {
    defaults,
    aliases: ['feeds', 'rss', 'rss-feeds', 'lootscraper'],
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
        AutofeedsSubscriptionService,
        AutofeedsWebhookService,
        AutofeedsAiService,
        AutofeedsOpmlService,
        AutofeedsGamificationService,
        AutofeedsRateLimitService,
        AutofeedsDigestService,
        AutofeedsPulseService,
        AutofeedsClusteringService,
        AutofeedsPurgeService,
        AutofeedsAudioService,
        AutofeedsService,
        AutofeedInteractionListener,
        AutofeedsModule
    ],
    controllers: [AutofeedsController, AutofeedsWebhooksController],
    commands: [AutofeedCommands]
})(AutofeedsModule);

module.exports = { AutofeedsModule };
