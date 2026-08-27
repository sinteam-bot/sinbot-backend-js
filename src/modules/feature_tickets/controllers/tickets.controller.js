/**
 * TicketsController — endpoints REST pour les tickets
 *
 *   GET    /api/tickets              : liste paginée, filtres status/userId/category
 *   GET    /api/tickets/:id          : détail d'un ticket
 *   GET    /api/tickets/:id/messages : transcript brut (messages)
 *   POST   /api/tickets              : ouverture programmatique (webhook)
 *   PATCH  /api/tickets/:id         : update status/claim (admin via dashboard)
 *   POST   /api/tickets/:id/close    : close + transcript
 */

const { Controller, Get, Post, Put } = require('../../../core/index.js');
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

            const where = [];
            const args = [guildId];
            if (guildId) { where.push('guild_id = $1'); }
            if (status) { args.push(status); where.push(`status = $${args.length}`); }
            if (userId) { args.push(userId); where.push(`user_id = $${args.length}`); }
            if (category) { args.push(category); where.push(`category = $${args.length}`); }
            const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

            const { db } = require('../../../db/index.js');
            args.push(limit, offset);
            const sql = `SELECT * FROM tickets ${whereSql} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`;
            const result = await db.pool.query({ text: sql, values: args });
            const countRes = await db.pool.query({ text: `SELECT COUNT(*)::int AS total FROM tickets ${whereSql}`, values: args.slice(0, args.length - 2) });
            const total = countRes.rows?.[0]?.total || 0;

            return {
                success: true,
                data: {
                    tickets: result.rows || [],
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
            const allowed = ['status', 'claimed_by', 'closed_by', 'closed_at', 'subject'];
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
}

Controller('/api/tickets')(TicketsController);
Get('/')(TicketsController.prototype, 'list');
Get('/:id')(TicketsController.prototype, 'detail');
Get('/:id/messages')(TicketsController.prototype, 'messages');
Put('/:id')(TicketsController.prototype, 'update');
Post('/:id/close')(TicketsController.prototype, 'close');
Get('/:id/transcript')(TicketsController.prototype, 'transcript');

module.exports = { TicketsController };
