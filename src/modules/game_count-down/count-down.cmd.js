const { Command } = require('../../core/index.js');
const { CountDownService } = require('./count-down.service.js');

class CountDownCommand {
    static inject = [CountDownService];

    constructor(service) {
        this.service = service;
    }

    async executeCommand(interaction) {
        const state = await this.service.getGameState(interaction.channelId);
        await interaction.reply({
            content: `⏳ **Compte à Rebours** : Nombre actuel = **${state.currentNumber}** (Prochain = **${state.currentNumber - 1}**) | Piège actif = **${state.isTrapActive ? 'Oui 🪤' : 'Non'}**`,
            ephemeral: true
        });
    }
}

Command({ name: 'countdown', description: 'Affiche l\'état courant du Compte à Rebours' })(CountDownCommand.prototype, 'executeCommand');

module.exports = {
    CountDownCommand
};
