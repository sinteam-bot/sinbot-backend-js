const { OnEvent } = require('../../core/index.js');
const { CountDownService } = require('./count-down.service.js');

class CountDownEvent {
    static inject = [CountDownService];

    constructor(service) {
        this.service = service;
    }

    async onMessageCreate(message) {
        await this.service.handleIncomingMessage(message);
    }

    async onClientReady(client) {
        await this.service.initCountdownChannel(client);
    }
}

OnEvent('messageCreate', { configKey: 'countdown', ignoreBots: true, priority: 10 })(CountDownEvent.prototype, 'onMessageCreate');
OnEvent('clientReady', { configKey: 'countdown', priority: 5 })(CountDownEvent.prototype, 'onClientReady');

module.exports = {
    CountDownEvent
};
