/**
 * custom-commands/events/message-create.listener.js
 *
 * Déclenche les custom commands configurées (préfixe "!").
 *
 * Issue du split de game_engagement-advanced/ (Phase 9.2).
 */

const { OnEvent } = require('../../../core/index.js');
const { CustomCommandService } = require('../services/custom-command.service.js');

class CustomCommandsMessageListener {
    static inject = [CustomCommandService];

    constructor(customs) {
        this.customs = customs;
        this._cacheReady = false;
    }

    async _ensureCache(guildId) {
        if (this._cacheReady) return;
        await this.customs.loadCache(guildId).catch(err =>
            console.warn('[CustomCommandsListener] Erreur cache:', err.message)
        );
        this._cacheReady = true;
    }

    async _isEnabled(guildId) {
        const { featureRegistry } = require('../../../core/feature-registry.js');
        const state = await featureRegistry.get(guildId, 'custom_commands');
        return state.enabled;
    }

    async handle(message) {
        if (!message?.guild) return;
        if (message.author?.bot) return;

        const enabled = await this._isEnabled(message.guild.id);
        if (!enabled) return;

        await this._ensureCache(message.guild.id);
        const content = (message.content || '').trim();
        if (!content.startsWith('!')) return;

        const name = content.slice(1).split(/s+/)[0].toLowerCase();
        if (!name) return;

        const cmd = await this.customs.find(message.guild.id, name);
        if (!cmd) return;

        const ok = this.customs.canRun(cmd, message, message.member);
        if (!ok.ok) return;

        this.customs.incrementCooldown(cmd);
        await this._fireCustomCommand(cmd, message, name);
    }


}

OnEvent('messageCreate', {
    configKey: 'features.custom_commands',
    priority: 36
})(CustomCommandsMessageListener.prototype, 'handle');

module.exports = { CustomCommandsMessageListener };
