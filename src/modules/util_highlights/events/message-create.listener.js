/**
 * src/modules/util_highlights/events/message-create.listener.js
 *
 * Listener messageCreate pour détecter les mots-clés Highlights.
 */

const { Event } = require('../../../core/index.js');
const { HighlightsService } = require('../services/highlights.service.js');

class HighlightsMessageListener {
    static inject = [HighlightsService];

    constructor(service) {
        this.service = service;
    }

    async onMessageCreate(message) {
        if (!message || message.author?.bot || !message.guild) return;
        await this.service.checkAndNotify(message, message.client);
    }
}

Event('messageCreate')(HighlightsMessageListener.prototype, 'onMessageCreate');

module.exports = { HighlightsMessageListener };
