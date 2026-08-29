/**
 * Slash command /ticket avec sous-commandes — déclarée ici pour être déployée.
 *
 * L'exécution réelle est gérée par TicketInteractionListener
 * (events/interaction-create.listener.js) qui a accès à tout
 * l'état du ticket en BDD.
 */

const { Command } = require('../../../core/index.js');
const { SlashCommandBuilder } = require('discord.js');

class TicketCommands {
    static isTicketCommand = true;
    static inject = [];

    static __commandBuilder = new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Gestion des tickets de support')
        .addSubcommand(sub =>
            sub.setName('close')
                .setDescription('Fermer le ticket courant')
                .addStringOption(o => o.setName('reason').setDescription('Raison de la fermeture').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('claim')
                .setDescription('Prendre en charge le ticket courant')
        )
        .addSubcommand(sub =>
            sub.setName('unclaim')
                .setDescription('Lâcher la prise en charge du ticket courant')
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Ajouter un utilisateur au ticket')
                .addUserOption(o => o.setName('user').setDescription('Utilisateur').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Retirer un utilisateur du ticket')
                .addUserOption(o => o.setName('user').setDescription('Utilisateur').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('rename')
                .setDescription('Renommer le ticket courant')
                .addStringOption(o => o.setName('name').setDescription('Nouveau nom').setRequired(true).setMaxLength(32))
        )
        .addSubcommand(sub =>
            sub.setName('transcript')
                .setDescription('Générer le transcript HTML du ticket')
        )
        .addSubcommand(sub =>
            sub.setName('reopen')
                .setDescription('Rouvrir un ticket fermé')
        );

    constructor() {}

    /**
     * Méthode no-op : l'exécution réelle passe par le listener.
     * Cette méthode n'est appelée que si le listener n'a pas
     * traité l'interaction (par ex. hors d'un ticket).
     */
    async execute(interaction) {
        return interaction.reply({
            content: '❌ Cette commande doit être exécutée dans un salon ticket.',
            ephemeral: true
        });
    }
}

Command({ name: 'ticket', description: 'Gestion des tickets' })(TicketCommands.prototype, 'execute');

module.exports = {
    TicketCommands
};
