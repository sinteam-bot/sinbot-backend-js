/**
 * src/modules/util_word_triggers/events/message-create.listener.js
 *
 * Déclenche les word triggers configurés quand un message matche (Phase 8 G02, G30, G43, G19).
 */

const { EmbedBuilder } = require('discord.js');
const { OnEvent } = require('../../../core/index.js');
const { WordTriggerService } = require('../services/word-trigger.service.js');
const { parseCommandTags } = require('../../../utils/commandTagParser.js');
const logger = require('../../../utils/logger.js');

class WordTriggersMessageListener {
    static inject = [WordTriggerService];

    constructor(triggers) {
        this.triggers = triggers;
        this._cacheReady = false;
    }

    async _ensureCache(guildId) {
        if (this._cacheReady) return;
        await this.triggers.loadCache(guildId).catch(err =>
            logger.warn(`[WordTriggersListener] Erreur cache: ${err.message}`, 'WORD_TRIGGERS')
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
        const trigger = await this.triggers.findMatching(message.guild.id, content);
        if (!trigger) return;

        const ok = this.triggers.shouldFire(trigger, message, message.member);
        if (!ok.ok) return;

        this.triggers.incrementCooldown(trigger);
        await this._fire(trigger, message);
    }

    async _fire(trigger, message) {
        try {
            const context = {
                member: message.member,
                user: message.author,
                guild: message.guild,
                channel: message.channel,
                message
            };

            const payload = {};

            if (trigger.responseText) {
                const parsed = await parseCommandTags(trigger.responseText, context);
                if (parsed.text) payload.content = parsed.text;
            }

            if (trigger.responseEmbed) {
                const embedData = typeof trigger.responseEmbed === 'string'
                    ? JSON.parse(trigger.responseEmbed)
                    : trigger.responseEmbed;

                const embed = new EmbedBuilder();
                if (embedData.title) {
                    const parsedTitle = await parseCommandTags(embedData.title, context, { executeActions: false });
                    embed.setTitle(parsedTitle.text);
                }
                if (embedData.description) {
                    const parsedDesc = await parseCommandTags(embedData.description, context, { executeActions: false });
                    embed.setDescription(parsedDesc.text);
                }
                if (embedData.color) embed.setColor(embedData.color);
                payload.embeds = [embed];
            }

            if (payload.content || payload.embeds?.length) {
                await message.channel.send(payload);
            }
        } catch (err) {
            logger.warn(`Erreur exécution word trigger ${trigger.id}: ${err.message}`, 'WORD_TRIGGERS');
        }
    }
}

OnEvent('messageCreate', {
    configKey: 'features.word_triggers',
    priority: 35
})(WordTriggersMessageListener.prototype, 'handle');

module.exports = { WordTriggersMessageListener };
