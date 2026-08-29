const { OnEvent } = require('../../core/index.js');
const { WelcomeService } = require('./welcome.service.js');
const { config, getConfig } = require('../../config/index.js');

class WelcomeEvent {
    static inject = [WelcomeService];

    constructor(service) {
        this.service = service;
    }

    async onGuildMemberAdd(member) {
        if (!member || member.user?.bot) return;

        const currentConfig = getConfig ? getConfig() : config;
        const isCaptchaActive = currentConfig.captcha && currentConfig.captcha.enabled !== false;

        // Si le captcha est activé, SecurityQuestionService gérera l'accueil après validation
        if (!isCaptchaActive) {
            await this.service.handleWelcome(member);
        }
    }
}

OnEvent('guildMemberAdd', { priority: 1, configKey: 'welcome' })(WelcomeEvent.prototype, 'onGuildMemberAdd');

module.exports = {
    WelcomeEvent
};
