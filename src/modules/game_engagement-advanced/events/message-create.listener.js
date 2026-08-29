/**
 * message-create.listener.js — déclenche les triggers de mots
 * et les commandes personnalisées
 *
 * Logique :
 *   1. Si le message commence par prefix ("!"), chercher une custom cmd
 *   2. Sinon, chercher un trigger qui matche le contenu
 *   3. Vérifier canRun / shouldFire
 *   4. Envoyer la réponse (texte ou embed)
 *
 * Les cooldowns sont gérés en mémoire (par trigger/cmd).
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { WordTriggerService } = require('../services/word-trigger.service.js');
const { CustomCommandService } = require('../services/custom-command.service.js');
const { getConfig } = require('../../../config/index.js');

class MessageCreateListener {
    static inject = [WordTriggerService, CustomCommandService];

    constructor(triggers, customs) {
        this.triggers = triggers;
        this.customs = customs;
        this._cacheReady = false;
    }

    async _ensureCache(guildId) {
        if (this._cacheReady) return;
        await Promise.all([
            this.triggers.loadCache(guildId).catch(err => console.warn('[MessageCreateListener] Erreur cache triggers:', err.message)),
            this.customs.loadCache(guildId).catch(err => console.warn('[MessageCreateListener] Erreur cache custom commands:', err.message))
        ]);
        this._cacheReady = true;
    }

    async _isEnabled(guildId) {
        const state = await featureRegistry.get(guildId, 'engagement-advanced');
        return state.enabled;
    }

    async handle(message) {
        if (!message?.guild) return;
        if (message.author?.bot) return;

        const enabled = await this._isEnabled(message.guild.id);
        if (!enabled) return;

        await this._ensureCache(message.guild.id);
        const cfg = getConfig().features?.['engagement-advanced'] || {};
        const prefix = cfg.custom_commands?.prefix || '!';
        const content = (message.content || '').trim();
        if (!content) return;

        // 1. Custom command (préfixe !)
        if (content.startsWith(prefix) && content.length > prefix.length) {
            const name = content.slice(prefix.length).split(/\s+/)[0].toLowerCase();
            const cmd = await this.customs.find(message.guild.id, name);
            if (cmd) {
                const ok = this.customs.canRun(cmd, message, message.member);
                if (ok.ok) {
                    this.customs.incrementCooldown(cmd);
                    await this._send(message, cmd);
                    return;
                }
            }
        }

        // 2. Word trigger
        const trigger = this.triggers.findMatching(message.guild.id, content);
        if (trigger) {
            const ok = this.triggers.shouldFire(trigger, message, message.member);
            if (ok.ok) {
                this.triggers.incrementCooldown(trigger);
                await this._send(message, { responseText: trigger.responseText, responseEmbed: trigger.responseEmbed });
            }
        }
    }

    async _send(message, item) {
        try {
            const payload = {};
            if (item.responseText) payload.content = item.responseText;
            if (item.responseEmbed) payload.embeds = [item.responseEmbed];
            if (Object.keys(payload).length === 0) return;
            await message.channel.send(payload);
        } catch (err) {
            console.error(`[MessageCreateListener] send failed: ${err.message}`);
        }
    }
}

OnEvent('messageCreate', { configKey: 'features.engagement-advanced', priority: 30 })(MessageCreateListener.prototype, 'handle');

module.exports = { MessageCreateListener };
