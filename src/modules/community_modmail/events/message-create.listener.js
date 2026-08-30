/**
 * src/modules/community_modmail/events/message-create.listener.js
 *
 * Listener messageCreate pour ModMail (DMs membres et réponses salon staff).
 */

const { ChannelType } = require('discord.js');
const { Event, getConfig } = require('../../../core/index.js');
const { ModMailService } = require('../services/modmail.service.js');

class ModMailListener {
    static inject = [ModMailService];

    constructor(service) {
        this.service = service;
    }

    _getConfig() {
        return getConfig().features?.modmail || {};
    }

    async onMessageCreate(message) {
        if (!message || message.author?.bot) return;

        const config = this._getConfig();

        // 1. Message privé d'un membre -> Bot
        if (message.channel.type === ChannelType.DM || !message.guild) {
            await this.service.handleUserDM(message, message.client, config);
            return;
        }

        // 2. Message posté par un modérateur dans un salon ModMail staff
        if (message.guild && message.channel) {
            const thread = await this.service.repo.getThreadByChannel(message.channel.id);
            if (!thread) return;

            // Ignorer si c'est une commande slash ou préfixée
            if (message.content?.startsWith('/') || message.content?.startsWith('!')) return;

            const isAnonymous = Boolean(config.anonymous_replies_by_default);
            await this.service.replyToUser({
                channelId: message.channel.id,
                staffUser: message.member || message.author,
                content: message.content,
                isAnonymous,
                client: message.client,
                config
            });
        }
    }
}

Event('messageCreate')(ModMailListener.prototype, 'onMessageCreate');

module.exports = { ModMailListener };
