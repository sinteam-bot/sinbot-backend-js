const { OnEvent } = require('../../core/index.js');
const { StartupNotifierService } = require('./startup-notifier.service.js');

class StartupNotifierEvent {
    static inject = [StartupNotifierService];

    constructor(service) {
        this.service = service;
    }

    async onClientReady(client) {
        await this.service.sendStartupNotification(client);
    }
}

OnEvent('clientReady', { configKey: 'startup_notifier', priority: 1 })(StartupNotifierEvent.prototype, 'onClientReady');

module.exports = {
    StartupNotifierEvent
};
