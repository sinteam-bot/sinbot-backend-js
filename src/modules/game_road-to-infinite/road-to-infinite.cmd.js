const { Command } = require('../../core/index.js');
const { RoadToInfiniteService } = require('./road-to-infinite.service.js');

class RoadToInfiniteCommand {
    static inject = [RoadToInfiniteService];

    constructor(service) {
        this.service = service;
    }

    async executeCommand(interaction) {
        const state = await this.service.getGameState(interaction.channelId);
        await interaction.reply({
            content: `🔢 **Route de l'Infini** : Nombre actuel = **${state.currentNumber}** (Prochain = **${state.currentNumber + 1}**)`,
            ephemeral: true
        });
    }
}

Command({ name: 'counter', description: 'Affiche l\'état courant de la Route de l\'Infini' })(RoadToInfiniteCommand.prototype, 'executeCommand');

module.exports = {
    RoadToInfiniteCommand
};
