const { Command } = require('../../core/index.js');
const { BumpReminderService } = require('./bump-reminder.service.js');

class BumpReminderCommand {
    static inject = [BumpReminderService];

    constructor(service) {
        this.service = service;
    }

    async executeCommand(interaction) {
        const status = await this.service.getBumpStatus(interaction.guildId);

        if (!status.hasBump) {
            await interaction.reply({
                content: 'ℹ️ Aucun bump n\'a encore été enregistré sur ce serveur.',
                ephemeral: true
            });
            return;
        }

        if (status.isReady) {
            await interaction.reply({
                content: '🔔 **Le serveur est prêt à être bumpé !** Tapez </bump:947088344167366698>',
                ephemeral: false
            });
        } else {
            const minutes = Math.floor(status.remainingSeconds / 60);
            const seconds = status.remainingSeconds % 60;
            await interaction.reply({
                content: `⏳ Prochain bump disponible dans **${minutes}m ${seconds}s** (Dernier bump par **${status.lastBump.bumperUsername || 'un membre'}**).`,
                ephemeral: true
            });
        }
    }
}

Command({ name: 'bump', description: 'Afficher le statut et le décompte du prochain bump Disboard' })(BumpReminderCommand.prototype, 'executeCommand');

module.exports = {
    BumpReminderCommand
};
