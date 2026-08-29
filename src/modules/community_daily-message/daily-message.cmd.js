const { Command } = require('../../core/index.js');
const { DailyMessageService } = require('./daily-message.service.js');

class DailyMessageCommand {
    static inject = [DailyMessageService];

    constructor(service) {
        this.service = service;
    }

    async executeCommand(interaction) {
        const status = await this.service.getStatus();
        await interaction.reply({
            content: `🌅 **Message du Jour** : Statut = **${status.isPublishedToday ? 'Déjà publié aujourd\'hui ✅' : 'En attente de publication ⏳'}** | Dernier envoi = **${status.lastPublishedDate || 'Aucun'}**`,
            ephemeral: true
        });
    }
}

Command({ name: 'dailymessage', description: 'Afficher le statut du message du jour' })(DailyMessageCommand.prototype, 'executeCommand');

module.exports = {
    DailyMessageCommand
};
