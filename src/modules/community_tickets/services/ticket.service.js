/**
 * ticket.service.js — CRUD, state machine, multi-panels, ratings et tags des tickets (P4)
 */

const crypto = require('crypto');
const { Injectable } = require('../../../core/index.js');
const logger = require('../../../utils/logger.js');

function newId() {
    return crypto.randomUUID();
}

const STATUS = {
    OPEN: 'open',
    CLAIMED: 'claimed',
    CLOSED: 'closed'
};

class TicketService {
    static inject = [];

    constructor() {
        this.repo = null;
    }

    setRepo(repo) {
        this.repo = repo;
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
        await this.repo.insert({
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
        return this.repo.findById(id);
    }

    async getByChannel(channelId) {
        return this.repo.findByChannelId(channelId);
    }

    async list({ guildId, status, userId, limit = 50, offset = 0 } = {}) {
        return this.repo.list({ guildId, status, userId, limit, offset });
    }

    async count({ guildId, status, userId } = {}) {
        return this.repo.count({ guildId, status, userId });
    }

    async claim(id, modUserId) {
        await this.repo.update(id, { status: STATUS.CLAIMED, claimedBy: modUserId, updatedAt: Date.now() });
        return this.repo.findById(id);
    }

    async unclaim(id) {
        await this.repo.update(id, { status: STATUS.OPEN, claimedBy: null, updatedAt: Date.now() });
        return this.repo.findById(id);
    }

    async close(id, closerUserId) {
        const now = Date.now();
        await this.repo.update(id, {
            status: STATUS.CLOSED,
            closedBy: closerUserId,
            closedAt: now,
            updatedAt: now
        });
        return this.repo.findById(id);
    }

    async reopen(id) {
        await this.repo.update(id, {
            status: STATUS.OPEN,
            closedBy: null,
            closedAt: null,
            updatedAt: Date.now()
        });
        return this.repo.findById(id);
    }

    async deleteByChannelId(channelId) {
        return this.repo.deleteByChannelId(channelId);
    }

    async countOpenByUser(guildId, userId) {
        const result = await this.repo.count({ guildId, userId, status: STATUS.OPEN });
        return result;
    }

    /**
     * Ajoute un message au transcript d'un ticket
     */
    async logMessage({ ticketId, authorId, content, attachments = [], isStaff = false }) {
        if (!ticketId) return null;
        const id = newId();
        await this.repo.insertMessage({
            id, ticketId, authorId,
            content: content || null,
            attachments: JSON.stringify(attachments),
            isStaff: isStaff ? 1 : 0,
            createdAt: Date.now()
        });
        return id;
    }

    async getMessages(ticketId, limit = 500) {
        const rows = await this.repo.findMessages(ticketId, limit);
        return rows.map(r => ({
            ...r,
            attachments: r.attachments ? safeParse(r.attachments, []) : []
        }));
    }

    // =================== RATINGS ===================

    async addRating({ ticketId, guildId, userId, staffId = null, rating, feedback = null }) {
        const score = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
        return this.repo.addRating({
            ticketId,
            guildId,
            userId,
            staffId,
            rating: score,
            feedback
        });
    }

    async getRatingStats(guildId) {
        return this.repo.getRatingStats(guildId);
    }

    async listRatings(guildId, limit = 50) {
        return this.repo.listRatings(guildId, limit);
    }

    // =================== PANELS ===================

    async createPanel(data) {
        return this.repo.createPanel(data);
    }

    async getPanel(guildId, name) {
        return this.repo.getPanel(guildId, name);
    }

    async getPanelById(id) {
        return this.repo.getPanelById(id);
    }

    async listPanels(guildId) {
        return this.repo.listPanels(guildId);
    }

    async deletePanel(guildId, name) {
        await this.repo.deletePanel(guildId, name);
        return { ok: true };
    }

    // =================== TAGS ===================

    async setTag(data) {
        return this.repo.setTag(data);
    }

    async getTag(guildId, name) {
        return this.repo.getTag(guildId, name);
    }

    async listTags(guildId) {
        return this.repo.listTags(guildId);
    }

    async deleteTag(guildId, name) {
        await this.repo.deleteTag(guildId, name);
        return { ok: true };
    }

    // =================== AUTO-CLOSE ===================

    async processAutoClose(client, config = {}) {
        const autoCloseHours = config.auto_close_hours || 0;
        if (autoCloseHours <= 0 || !client) return 0;

        const maxAgeMs = autoCloseHours * 3600 * 1000;
        const now = Date.now();
        let closedCount = 0;

        const openTickets = await this.repo.list({ status: STATUS.OPEN, limit: 100 });
        for (const t of openTickets) {
            const messages = await this.repo.findMessages(t.id, 1);
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
