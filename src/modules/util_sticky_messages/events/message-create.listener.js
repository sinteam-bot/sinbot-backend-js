/**
 * src/modules/util_sticky_messages/events/message-create.listener.js
 *
 * Listener messageCreate pour gérer les Sticky Messages.
 */

const { OnEvent } = require('../../../core/index.js');
const { StickyService } = require('../services/sticky.service.js');

class StickyMessageListener {
    static inject = [StickyService];

    constructor(service) {
        this.service = service;
    }

    async onMessageCreate(message) {
        if (!message || message.author?.bot || !message.guild) return;
        await this.service.onMessage(message, message.client);
    }
}

OnEvent('messageCreate')(StickyMessageListener.prototype, 'onMessageCreate');

module.exports = { StickyMessageListener };
