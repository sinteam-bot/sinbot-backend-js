const { OnEvent } = require('../../core/index.js');
const { SecurityQuestionService } = require('./security-question.service.js');

class SecurityQuestionEvent {
    static inject = [SecurityQuestionService];

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

OnEvent('guildMemberAdd', { configKey: 'captcha', priority: 20 })(SecurityQuestionEvent.prototype, 'onGuildMemberAdd');
OnEvent('messageCreate', { configKey: 'captcha', ignoreBots: true, priority: 20 })(SecurityQuestionEvent.prototype, 'onMessageCreate');

module.exports = {
    SecurityQuestionEvent
};
