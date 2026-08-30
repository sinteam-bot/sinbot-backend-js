/**
 * src/modules/automation_autothread/events/message-create.listener.js
 *
 * Listener messageCreate pour la création automatique de threads.
 */

const { OnEvent } = require('../../../core/index.js');
const { AutoThreadService } = require('../services/autothread.service.js');

class AutoThreadListener {
    static inject = [AutoThreadService];

    constructor(service) {
        this.service = service;
    }

    async onMessageCreate(message) {
        if (!message || message.author?.bot || !message.guild || message.channel?.isThread?.()) {
            return;
        }

        await this.service.handleMessage(message);
    }
}

OnEvent('messageCreate')(AutoThreadListener.prototype, 'onMessageCreate');

module.exports = { AutoThreadListener };
