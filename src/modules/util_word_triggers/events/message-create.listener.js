/**
 * word-triggers/events/message-create.listener.js
 *
 * Déclenche les word triggers configurés quand un message matche.
 *
 * Issue du split de game_engagement-advanced/ (Phase 9.2 du plan
 * migrate-to-c12). Avant : logique mélangée avec custom commands.
 */

const { OnEvent } = require('../../../core/index.js');
const { WordTriggerService } = require('../services/word-trigger.service.js');

class WordTriggersMessageListener {
    static inject = [WordTriggerService];

    constructor(triggers) {
        this.triggers = triggers;
        this._cacheReady = false;
    }

    async _ensureCache(guildId) {
        if (this._cacheReady) return;
        await this.triggers.loadCache(guildId).catch(err =>
            console.warn('[WordTriggersListener] Erreur cache:', err.message)
        );
        this._cacheReady = true;
    }

    async _isEnabled(guildId) {
        const { featureRegistry } = require('../../../core/feature-registry.js');
        const state = await featureRegistry.get(guildId, 'word_triggers');
        return state.enabled;
    }

    async handle(message) {
        if (!message?.guild) return;
        if (message.author?.bot) return;

        const enabled = await this._isEnabled(message.guild.id);
        if (!enabled) return;

        await this._ensureCache(message.guild.id);
        const content = message.content || '';
        const trigger = this.triggers.findMatching(message.guild.id, content);
        if (!trigger) return;

        const ok = this.triggers.shouldFire(trigger, message, message.member);
        if (!ok.ok) return;

        this.triggers.incrementCooldown(trigger);
        await this._fire(trigger, message);
    }


}

OnEvent('messageCreate', {
    configKey: 'features.word_triggers',
    priority: 35
})(WordTriggersMessageListener.prototype, 'handle');

module.exports = { WordTriggersMessageListener };
