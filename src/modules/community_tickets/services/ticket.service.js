/**
 * ticket.service.js — CRUD, state machine, multi-panels, ratings et tags des tickets (P4)
 */

const crypto = require('crypto');
const { Injectable } = require('../../../core/index.js');
const logger = require('../../../utils/logger.js');
const { TicketRepository } = require('./ticket.repository.js');

function newId() {
    return crypto.randomUUID();
}

const STATUS = {
    OPEN: 'open',
    CLAIMED: 'claimed',
    CLOSED: 'closed'
};

class TicketService {
    static inject = [TicketRepository];

    constructor(repo = null) {
        this.repo = repo || new TicketRepository();
    }

    setRepo(repo) {
        this.repo = repo;
    }

    getRepo() {
        if (!this.repo) {
            this.repo = new TicketRepository();
        }
        return this.repo;
    }

    /**
     * Crée un ticket en BDD
     */
    async create({ guildId, channelId, userId, category, subject, panelId = null }) {
        if (!guildId || !channelId || !userId) {
            throw new Error('guildId, channelId et userId requis');
        }
        const now = Date.now();
        const id = newId();
        await this.getRepo().insert({
            id, guildId, channelId, userId,
            category: category || 'support',
            subject: subject || null,
            status: STATUS.OPEN,
            panelId,
            createdAt: now,
            updatedAt: now
        });
        return { id, status: STATUS.OPEN, panelId };
    }

    async get(id) {
        return this.getRepo().findById(id);
    }

    async getByChannel(channelId) {
        return this.getRepo().findByChannelId(channelId);
    }

    async list({ guildId, status, userId, limit = 50, offset = 0 } = {}) {
        return this.getRepo().list({ guildId, status, userId, limit, offset });
    }

    async count({ guildId, status, userId } = {}) {
        return this.getRepo().count({ guildId, status, userId });
    }

    async claim(id, modUserId) {
        await this.getRepo().update(id, { status: STATUS.CLAIMED, claimedBy: modUserId, updatedAt: Date.now() });
        return this.getRepo().findById(id);
    }

    async unclaim(id) {
        await this.getRepo().update(id, { status: STATUS.OPEN, claimedBy: null, updatedAt: Date.now() });
        return this.getRepo().findById(id);
    }

    async close(id, closerUserId) {
        const now = Date.now();
        await this.getRepo().update(id, {
            status: STATUS.CLOSED,
            closedBy: closerUserId,
            closedAt: now,
            updatedAt: now
        });
        return this.getRepo().findById(id);
    }

    async reopen(id) {
        await this.getRepo().update(id, {
            status: STATUS.OPEN,
            closedBy: null,
            closedAt: null,
            updatedAt: Date.now()
        });
        return this.getRepo().findById(id);
    }

    async deleteByChannelId(channelId) {
        return this.getRepo().deleteByChannelId(channelId);
    }

    async countOpenByUser(guildId, userId) {
        const result = await this.getRepo().count({ guildId, userId, status: STATUS.OPEN });
        return result;
    }

    /**
     * Ajoute un message au transcript d'un ticket
     */
    async logMessage({ ticketId, authorId, content, attachments = [], isStaff = false }) {
        if (!ticketId) return null;
        const id = newId();
        await this.getRepo().insertMessage({
            id, ticketId, authorId,
            content: content || null,
            attachments: JSON.stringify(attachments),
            isStaff: isStaff ? 1 : 0,
            createdAt: Date.now()
        });
        return id;
    }

    async getMessages(ticketId, limit = 500) {
        const rows = await this.getRepo().findMessages(ticketId, limit);
        return rows.map(r => ({
            ...r,
            attachments: r.attachments ? safeParse(r.attachments, []) : []
        }));
    }

    // =================== RATINGS ===================

    async addRating({ ticketId, guildId, userId, staffId = null, rating, feedback = null }) {
        const score = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
        return this.getRepo().addRating({
            ticketId,
            guildId,
            userId,
            staffId,
            rating: score,
            feedback
        });
    }

    async getRatingStats(guildId) {
        return this.getRepo().getRatingStats(guildId);
    }

    async listRatings(guildId, limit = 50) {
        return this.getRepo().listRatings(guildId, limit);
    }

    // =================== PANELS ===================

    async createPanel(data) {
        return this.getRepo().createPanel(data);
    }

    async getPanel(guildId, name) {
        return this.getRepo().getPanel(guildId, name);
    }

    async getPanelById(id) {
        return this.getRepo().getPanelById(id);
    }

    async listPanels(guildId) {
        return this.getRepo().listPanels(guildId);
    }

    async deletePanel(guildId, name) {
        await this.getRepo().deletePanel(guildId, name);
        return { ok: true };
    }

    // =================== TAGS ===================

    async setTag(data) {
        return this.getRepo().setTag(data);
    }

    async getTag(guildId, name) {
        return this.getRepo().getTag(guildId, name);
    }

    async listTags(guildId) {
        return this.getRepo().listTags(guildId);
    }

    async deleteTag(guildId, name) {
        await this.getRepo().deleteTag(guildId, name);
        return { ok: true };
    }

    // =================== AUTO-CLOSE ===================

    async processAutoClose(client, config = {}) {
        const autoCloseHours = config.auto_close_hours || 0;
        if (autoCloseHours <= 0 || !client) return 0;

        const maxAgeMs = autoCloseHours * 3600 * 1000;
        const now = Date.now();
        let closedCount = 0;

        const openTickets = await this.getRepo().list({ status: STATUS.OPEN, limit: 100 });
        for (const t of openTickets) {
            const messages = await this.getRepo().findMessages(t.id, 1);
            const lastMsg = messages[messages.length - 1];
            const lastActive = lastMsg ? Number(lastMsg.created_at) : t.updatedAt;

            if (now - lastActive > maxAgeMs) {
                await this.close(t.id, 'Auto-Close System');

                const chan = client.channels.cache.get(t.channelId);
                if (chan && chan.send) {
                    await chan.send(`⏳ Ce ticket a été fermé automatiquement pour inactivité (${autoCloseHours}h sans réponse).`).catch(() => {});
                }
                closedCount++;
            }
        }

        if (closedCount > 0) {
            logger.info(`${closedCount} ticket(s) fermé(s) automatiquement pour inactivité`, 'TICKETS');
        }
        return closedCount;
    }
}

function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

Injectable()(TicketService);

module.exports = { TicketService, STATUS };
