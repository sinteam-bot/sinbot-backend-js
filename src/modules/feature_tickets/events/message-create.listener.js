/**
 * Listener messageCreate pour la capture des messages de tickets
 *
 * Pour chaque message posté dans un channel de ticket actif, on
 * log dans ticket_messages pour le transcript.
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { TicketService } = require('../services/ticket.service.js');
const { TicketPermissionsService } = require('../services/ticket-permissions.service.js');

class TicketMessageListener {
    static inject = [TicketService, TicketPermissionsService];

    constructor(ticketService, permissions) {
        this.ticketService = ticketService;
        this.permissions = permissions;
    }

    async handle(message) {
        if (!message || !message.guild || message.author?.bot) return;
        if (message.system) return;

        const state = await featureRegistry.get(message.guild.id, 'tickets');
        if (!state.enabled) return;

        const ticket = await this.ticketService.getByChannel(message.channelId);
        if (!ticket) return;
        if (ticket.status === 'closed') return;

        const member = message.member;
        const staffRoleIds = state.config?.allowed_roles || [];
        const isStaff = this.permissions.isStaff(member, staffRoleIds);

        const attachments = Array.from(message.attachments?.values?.() || []).map(a => ({
            id: a.id,
            name: a.name,
            url: a.url,
            contentType: a.contentType,
            size: a.size
        }));

        try {
            await this.ticketService.logMessage({
                ticketId: ticket.id,
                authorId: message.author.id,
                content: message.content || '',
                attachments,
                isStaff
            });
        } catch (err) {
            console.error(`[TicketMessageListener] logMessage failed: ${err.message}`);
        }
    }
}

OnEvent('messageCreate', {
    configKey: 'features.tickets',
    priority: 20
})(TicketMessageListener.prototype, 'handle');

module.exports = { TicketMessageListener };
