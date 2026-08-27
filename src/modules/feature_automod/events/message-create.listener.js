/**
 * Listener messageCreate pour l'automod
 * Branche sur l'EventBus pour profiter du système de priorité et de filtrage.
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { AutomodEngine } = require('../services/automod-engine.service.js');

class AutomodMessageCreateListener {
    static inject = [AutomodEngine];
    constructor(engine) {
        this.engine = engine;
    }

    async handle(message) {
        if (!message || !message.guild || message.author?.bot) return;
        const state = await featureRegistry.get(message.guild.id, 'automod');
        if (!state.enabled) return;
        await this.engine.processMessage(message, state.config);
    }
}

OnEvent('messageCreate', {
    configKey: 'features.automod',
    ignoreBots: true,
    priority: 50
})(AutomodMessageCreateListener.prototype, 'handle');

module.exports = { AutomodMessageCreateListener };
