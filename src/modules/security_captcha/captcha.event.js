const { OnEvent } = require('../../core/index.js');
const { CaptchaService } = require('./captcha.service.js');

class CaptchaEvent {
    static inject = [CaptchaService];

    constructor(service) {
        this.service = service;
    }

    async onGuildMemberAdd(member) {
        await this.service.handleMemberJoin(member);
    }

    async onMessageCreate(message) {
        await this.service.handleIncomingMessage(message);
    }
}

OnEvent('guildMemberAdd', { configKey: 'captcha', priority: 20 })(CaptchaEvent.prototype, 'onGuildMemberAdd');
OnEvent('messageCreate', { configKey: 'captcha', ignoreBots: true, priority: 20 })(CaptchaEvent.prototype, 'onMessageCreate');

module.exports = {
    CaptchaEvent
};
