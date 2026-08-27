/**
 * tickets.module.js — point d'entrée de la feature Tickets (Phase 3)
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { TicketRepository } = require('./services/ticket.repository.js');
const { TicketService } = require('./services/ticket.service.js');
const { TicketPermissionsService } = require('./services/ticket-permissions.service.js');
const { TicketManagerService } = require('./services/ticket-manager.service.js');
const { TranscriptService } = require('./services/transcript.service.js');
const { TicketInteractionListener } = require('./events/interaction-create.listener.js');
const { TicketMessageListener } = require('./events/message-create.listener.js');
const {
    TicketCloseCommand, TicketClaimCommand, TicketUnclaimCommand,
    TicketAddCommand, TicketRemoveCommand, TicketRenameCommand,
    TicketTranscriptCommand, TicketReopenCommand
} = require('./commands/ticket-commands.js');
const { TicketsController } = require('./controllers/tickets.controller.js');

featureRegistry.define('tickets', {
    defaults,
    onEnable: async (guildId) => console.log(`🎫 [tickets] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [tickets] disabled on ${guildId}`)
});

class TicketsModule {
    constructor(ticketService) {
        this.ticketService = ticketService;
        this._initialized = false;
    }

    onInit() {
        if (this._initialized) return;
        const repo = new TicketRepository();
        this.ticketService.setRepo(repo);
        this._initialized = true;
    }
}

Module({
    providers: [
        TicketRepository,
        TicketService,
        TicketPermissionsService,
        TicketManagerService,
        TranscriptService,
        TicketsModule
    ],
    controllers: [TicketsController],
    events: [
        TicketInteractionListener,
        TicketMessageListener
    ],
    commands: [
        TicketCloseCommand, TicketClaimCommand, TicketUnclaimCommand,
        TicketAddCommand, TicketRemoveCommand, TicketRenameCommand,
        TicketTranscriptCommand, TicketReopenCommand
    ]
})(TicketsModule);

module.exports = { TicketsModule };
