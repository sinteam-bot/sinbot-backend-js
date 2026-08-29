const { OnEvent } = require('../../core/index.js');
const { XPLevelService } = require('./xp-level.service.js');

class XPLevelEvent {
    static inject = [XPLevelService];

    constructor(service) {
        this.service = service;
    }

    async onMessageCreate(message) {
        await this.service.handleMessageXP(message);
    }

    async onVoiceStateUpdate(oldState, newState) {
        await this.service.handleVoiceStateUpdate(oldState, newState);
    }
}

OnEvent('messageCreate', { configKey: 'xp', ignoreBots: true, priority: 5 })(XPLevelEvent.prototype, 'onMessageCreate');
OnEvent('voiceStateUpdate', { configKey: 'xp', priority: 5 })(XPLevelEvent.prototype, 'onVoiceStateUpdate');

module.exports = {
    XPLevelEvent
};
