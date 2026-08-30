const { MessageFlags } = require('discord.js');
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

    /**
     * Intercepte les clics sur le bouton "J'ai validé le hCaptcha"
     * des challenges de type 'web'.
     */
    async onInteractionCreate(interaction) {
        if (!interaction.isButton()) return;
        const customId = interaction.customId || '';
        if (!customId.startsWith('captcha_web_validated:')) return;

        const userId = customId.split(':')[1];
        const channelId = interaction.channelId;

        // Vérifie que c'est bien le bon membre qui clique
        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: '❌ Ce bouton n\'est pas pour toi.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Pour valider, il faut que le membre ait résolu hCaptcha et
        // dispose du validationToken. Le bouton va déclencher un
        // mini-modal pour récupérer ce token, puis appeler
        // confirmWebCaptcha côté service.
        // Plus simple ici : on attend que le membre colle le token
        // dans le salon captcha, et handleIncomingMessage le détectera.
        // Pour fluidifier, on peut aussi lire le sessionStorage via
        // une deeplink. Pour l'instant, on lui indique la marche à suivre.
        await interaction.reply({
            content: 'ℹ️ Pour valider ton hCaptcha, colle ici le **validationToken** affiché sur la page de confirmation (après avoir cliqué "J\'ai validé" sur le site).',
            flags: MessageFlags.Ephemeral
        });
    }
}

OnEvent('guildMemberAdd', { configKey: 'captcha', priority: 20 })(CaptchaEvent.prototype, 'onGuildMemberAdd');
OnEvent('messageCreate', { configKey: 'captcha', ignoreBots: true, priority: 20 })(CaptchaEvent.prototype, 'onMessageCreate');
OnEvent('interactionCreate', { configKey: 'captcha', priority: 20 })(CaptchaEvent.prototype, 'onInteractionCreate');

module.exports = {
    CaptchaEvent
};
