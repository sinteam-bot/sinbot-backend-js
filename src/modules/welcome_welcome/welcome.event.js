const { OnEvent } = require('../../core/index.js');
const { WelcomeService } = require('./welcome.service.js');

class WelcomeEvent {
    static inject = [WelcomeService];

    constructor(service) {
        this.service = service;
    }

    /**
     * Appelé à l'arrivée d'un membre. On attribue immédiatement les
     * auto-rôles et on annonce les paliers. Le message public de
     * bienvenue et le DM sont gérés en deux temps :
     *   1. Si le captcha est désactivé → on welcome tout de suite.
     *   2. Si le captcha est actif → captcha.service.triggerWelcome
     *      appellera handleWelcome() après validation/résolution.
     */
    async onGuildMemberAdd(member) {
        if (!member || member.user?.bot) return;
        const guildId = member.guild?.id;
        if (!guildId) return;

        // Auto-rôles immédiats (indépendants du captcha)
        await this.service.assignAutoRoles(member);

        // Vérification palier (annonce événementielle, indépendante du captcha)
        await this.service.checkMilestone(member);

        // Si captcha inactif, on accueille tout de suite
        const { getConfig } = require('../../config/index.js');
        const currentConfig = getConfig();
        const isCaptchaActive = currentConfig.captcha && currentConfig.captcha.enabled !== false;
        if (!isCaptchaActive) {
            await this.service.handleWelcome(member);
        }
    }

    /**
     * Appelé au départ d'un membre.
     */
    async onGuildMemberRemove(member) {
        if (!member || !member.guild) return;
        await this.service.sendLeaveMessage(member);
    }
}

OnEvent('guildMemberAdd', { priority: 1, configKey: 'welcome' })(WelcomeEvent.prototype, 'onGuildMemberAdd');
OnEvent('guildMemberRemove', { priority: 1, configKey: 'welcome' })(WelcomeEvent.prototype, 'onGuildMemberRemove');

module.exports = {
    WelcomeEvent
};