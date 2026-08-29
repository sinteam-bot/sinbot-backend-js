const { Command } = require('../../core/index.js');
const { CaptchaService } = require('./captcha.service.js');

class CaptchaCommand {
    static inject = [CaptchaService];

    constructor(service) {
        this.service = service;
    }

    async executeCommand(interaction) {
        const captcha = await this.service.repo.getUserCaptcha(interaction.user.id, interaction.guildId);
        if (captcha && captcha.is_verified) {
            await interaction.reply({
                content: '✅ Votre compte est déjà vérifié avec succès.',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '🔒 Vérification en cours. Veuillez répondre à la question de sécurité dans votre salon dédié.',
                ephemeral: true
            });
        }
    }
}

Command({ name: 'verify', description: 'Vérifier l\'état de validation du compte' })(CaptchaCommand.prototype, 'executeCommand');

module.exports = {
    CaptchaCommand
};
