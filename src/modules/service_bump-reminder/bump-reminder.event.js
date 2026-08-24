const { OnEvent } = require('../../core/index.js');
const { BumpReminderService } = require('./bump-reminder.service.js');

class BumpReminderEvent {
    static inject = [BumpReminderService];

    constructor(service) {
        this.service = service;
    }

    async onMessageCreate(message) {
        await this.service.handleDisboardMessage(message);
    }
}

OnEvent('messageCreate', { ignoreBots: false, configKey: 'scheduler', priority: 15 })(BumpReminderEvent.prototype, 'onMessageCreate');

module.exports = {
    BumpReminderEvent
};
