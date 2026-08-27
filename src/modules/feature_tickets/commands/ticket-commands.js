/**
 * Slash commands /ticket-* — déclarées ici pour être déployées.
 *
 * L'exécution réelle est gérée par TicketInteractionListener
 * (events/interaction-create.listener.js) qui a accès à tout
 * l'état du ticket en BDD. Ces classes servent uniquement à
 * publier les SlashCommandBuilder via le ModuleManager et le
 * CommandDeployer.
 */

const { Command } = require('../../../core/index.js');

class TicketCommandBase {
    static isTicketCommand = true;
    static inject = [];

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

class TicketCloseCommand extends TicketCommandBase {
    static __commandBuilder = require('discord.js').SlashCommandBuilder
        ? new (require('discord.js').SlashCommandBuilder)()
            .setName('ticket-close')
            .setDescription('Fermer le ticket courant')
        : null;
    async execute(interaction) { return super.execute(interaction); }
}

class TicketClaimCommand extends TicketCommandBase {
    static __commandBuilder = require('discord.js').SlashCommandBuilder
        ? new (require('discord.js').SlashCommandBuilder)()
            .setName('ticket-claim')
            .setDescription('Prendre en charge le ticket courant')
        : null;
    async execute(interaction) { return super.execute(interaction); }
}

class TicketUnclaimCommand extends TicketCommandBase {
    static __commandBuilder = require('discord.js').SlashCommandBuilder
        ? new (require('discord.js').SlashCommandBuilder)()
            .setName('ticket-unclaim')
            .setDescription('Lâcher le ticket courant')
        : null;
    async execute(interaction) { return super.execute(interaction); }
}

class TicketAddCommand extends TicketCommandBase {
    static __commandBuilder = require('discord.js').SlashCommandBuilder
        ? new (require('discord.js').SlashCommandBuilder)()
            .setName('ticket-add')
            .setDescription('Ajouter un utilisateur au ticket')
            .addUserOption(o => o.setName('user').setDescription('Utilisateur').setRequired(true))
        : null;
    async execute(interaction) { return super.execute(interaction); }
}

class TicketRemoveCommand extends TicketCommandBase {
    static __commandBuilder = require('discord.js').SlashCommandBuilder
        ? new (require('discord.js').SlashCommandBuilder)()
            .setName('ticket-remove')
            .setDescription('Retirer un utilisateur du ticket')
            .addUserOption(o => o.setName('user').setDescription('Utilisateur').setRequired(true))
        : null;
    async execute(interaction) { return super.execute(interaction); }
}

class TicketRenameCommand extends TicketCommandBase {
    static __commandBuilder = require('discord.js').SlashCommandBuilder
        ? new (require('discord.js').SlashCommandBuilder)()
            .setName('ticket-rename')
            .setDescription('Renommer le ticket courant')
            .addStringOption(o => o.setName('name').setDescription('Nouveau nom').setRequired(true).setMaxLength(32))
        : null;
    async execute(interaction) { return super.execute(interaction); }
}

class TicketTranscriptCommand extends TicketCommandBase {
    static __commandBuilder = require('discord.js').SlashCommandBuilder
        ? new (require('discord.js').SlashCommandBuilder)()
            .setName('ticket-transcript')
            .setDescription('Générer le transcript HTML du ticket')
        : null;
    async execute(interaction) { return super.execute(interaction); }
}

class TicketReopenCommand extends TicketCommandBase {
    static __commandBuilder = require('discord.js').SlashCommandBuilder
        ? new (require('discord.js').SlashCommandBuilder)()
            .setName('ticket-reopen')
            .setDescription('Rouvrir un ticket fermé')
        : null;
    async execute(interaction) { return super.execute(interaction); }
}

Command({ name: 'ticket-close' })(TicketCloseCommand.prototype, 'execute');
Command({ name: 'ticket-claim' })(TicketClaimCommand.prototype, 'execute');
Command({ name: 'ticket-unclaim' })(TicketUnclaimCommand.prototype, 'execute');
Command({ name: 'ticket-add' })(TicketAddCommand.prototype, 'execute');
Command({ name: 'ticket-remove' })(TicketRemoveCommand.prototype, 'execute');
Command({ name: 'ticket-rename' })(TicketRenameCommand.prototype, 'execute');
Command({ name: 'ticket-transcript' })(TicketTranscriptCommand.prototype, 'execute');
Command({ name: 'ticket-reopen' })(TicketReopenCommand.prototype, 'execute');

module.exports = {
    TicketCloseCommand,
    TicketClaimCommand,
    TicketUnclaimCommand,
    TicketAddCommand,
    TicketRemoveCommand,
    TicketRenameCommand,
    TicketTranscriptCommand,
    TicketReopenCommand
};
