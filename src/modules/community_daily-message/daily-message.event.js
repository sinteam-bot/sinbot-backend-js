const { OnEvent } = require('../../core/index.js');
const { DailyMessageService } = require('./daily-message.service.js');

class DailyMessageEvent {
    static inject = [DailyMessageService];

    constructor(service) {
        this.service = service;
    }

    async onInteractionCreate(interaction) {
        await this.service.handleButtonInteraction(interaction);
    }
}

OnEvent('interactionCreate', { priority: 10 })(DailyMessageEvent.prototype, 'onInteractionCreate');

module.exports = {
    DailyMessageEvent
};
