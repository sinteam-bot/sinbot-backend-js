/**
 * TicketsController — endpoints REST pour les tickets, panels, ratings et tags
 *
 *   GET    /api/tickets              : liste paginée, filtres status/userId/category
 *   GET    /api/tickets/:id          : détail d'un ticket
 *   GET    /api/tickets/:id/messages : transcript brut (messages)
 *   PUT    /api/tickets/:id          : update status/claim (admin via dashboard)
 *   POST   /api/tickets/:id/close    : close + transcript
 *   GET    /api/tickets/:id/transcript : export HTML
 *   GET    /api/tickets/panels       : liste des multi-panneaux
 *   POST   /api/tickets/panels       : créer/modifier un panneau
 *   DELETE /api/tickets/panels/:name : supprimer un panneau
 *   GET    /api/tickets/ratings      : statistiques et avis
 *   POST   /api/tickets/ratings      : soumettre un avis
 *   GET    /api/tickets/tags         : liste des canned tags
 *   POST   /api/tickets/tags         : ajouter un tag
 *   DELETE /api/tickets/tags/:name   : supprimer un tag
 */

const { Controller, Get, Post, Put, Delete } = require('../../../core/index.js');
const { TicketService } = require('../services/ticket.service.js');
const { TranscriptService } = require('../services/transcript.service.js');

class TicketsController {
    static inject = [TicketService, TranscriptService];

    constructor(ticketService, transcriptService) {
        this.ticketService = ticketService;
        this.transcriptService = transcriptService;
        this.transcriptService.setTicketService(this.ticketService);
    }

    async list(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const status = req.query.status || null;
            const userId = req.query.user_id || null;
            const category = req.query.category || null;
            const page = Math.max(parseInt(req.query.page) || 1, 1);
            const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
            const offset = (page - 1) * limit;

            const result = await this.ticketService.list({ guildId, status, userId, limit, offset });
            const total = await this.ticketService.count({ guildId, status, userId });

            return {
                success: true,
                data: {
                    tickets: result || [],
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async detail(req) {
        try {
            const id = req.params.id;
            const ticket = await this.ticketService.get(id);
            if (!ticket) return { success: false, error: 'Ticket introuvable' };
            const messages = await this.ticketService.getMessages(id, 200);
            return { success: true, data: { ticket, messages } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async messages(req) {
        try {
            const id = req.params.id;
            const messages = await this.ticketService.getMessages(id, 1000);
            return { success: true, data: messages };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async update(req) {
        try {
            const id = req.params.id;
            const patch = req.body || {};
            const allowed = ['status', 'claimed_by', 'closed_by', 'closed_at', 'subject', 'panel_id', 'rating_score'];
            const fields = {};
            if (patch.status) fields.status = patch.status;
            if (patch.claimedBy !== undefined) fields.claimedBy = patch.claimedBy;
            if (patch.closedBy !== undefined) fields.closedBy = patch.closedBy;
            if (patch.subject !== undefined) fields.subject = patch.subject;
            fields.updatedAt = Date.now();
            await this.ticketService.repo.update(id, fields);
            return { success: true, data: await this.ticketService.get(id) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async close(req) {
        try {
            const id = req.params.id;
            const closerId = req.body?.closerId || null;
            const ticket = await this.ticketService.close(id, closerId);
            return { success: true, data: ticket };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async transcript(req) {
        try {
            const id = req.params.id;
            const html = await this.transcriptService.generateHTML(id);
            if (!html) return { success: false, error: 'Ticket introuvable' };
            return { success: true, data: { html } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // =================== PANELS ===================

    async listPanels(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.ticketService.listPanels(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async setPanel(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const res = await this.ticketService.createPanel({ ...req.body, guildId });
            return { success: true, data: res };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deletePanel(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const name = req.params?.name;
            await this.ticketService.deletePanel(guildId, name);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // =================== RATINGS ===================

    async getRatings(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const stats = await this.ticketService.getRatingStats(guildId);
            const list = await this.ticketService.listRatings(guildId);
            return { success: true, data: { stats, ratings: list } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async addRating(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { ticket_id, user_id, staff_id, rating, feedback } = req.body || {};
            const res = await this.ticketService.addRating({
                ticketId: ticket_id,
                guildId,
                userId: user_id,
                staffId: staff_id,
                rating,
                feedback
            });
            return { success: true, data: res };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // =================== TAGS ===================

    async listTags(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.ticketService.listTags(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async setTag(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { name, content, created_by } = req.body || {};
            const tag = await this.ticketService.setTag({ guildId, name, content, createdBy: created_by || 'admin' });
            return { success: true, data: tag };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteTag(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const name = req.params?.name;
            await this.ticketService.deleteTag(guildId, name);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/tickets')(TicketsController);
Get('/panels')(TicketsController.prototype, 'listPanels');
Post('/panels')(TicketsController.prototype, 'setPanel');
Delete('/panels/:name')(TicketsController.prototype, 'deletePanel');
Get('/ratings')(TicketsController.prototype, 'getRatings');
Post('/ratings')(TicketsController.prototype, 'addRating');
Get('/tags')(TicketsController.prototype, 'listTags');
Post('/tags')(TicketsController.prototype, 'setTag');
Delete('/tags/:name')(TicketsController.prototype, 'deleteTag');
Get('/:id/messages')(TicketsController.prototype, 'messages');
Get('/:id/transcript')(TicketsController.prototype, 'transcript');
Post('/:id/close')(TicketsController.prototype, 'close');
Get('/:id')(TicketsController.prototype, 'detail');
Put('/:id')(TicketsController.prototype, 'update');
Get('')(TicketsController.prototype, 'list');

module.exports = { TicketsController };
