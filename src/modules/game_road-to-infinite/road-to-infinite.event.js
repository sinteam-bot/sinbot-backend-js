const { OnEvent } = require('../../core/index.js');
const { RoadToInfiniteService } = require('./road-to-infinite.service.js');

class RoadToInfiniteEvent {
    static inject = [RoadToInfiniteService];

    constructor(service) {
        this.service = service;
    }

    async onMessageCreate(message) {
        await this.service.handleIncomingMessage(message);
    }
}

OnEvent('messageCreate', { configKey: 'counter', ignoreBots: true, priority: 10 })(RoadToInfiniteEvent.prototype, 'onMessageCreate');

module.exports = {
    RoadToInfiniteEvent
};
