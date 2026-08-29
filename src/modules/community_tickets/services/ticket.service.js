/**
 * ticket.service.js — CRUD et state machine des tickets
 *
 * Pas de dépendance sur discord.js dans le service (sauf pour les
 * types en JSDoc) afin de rester testable en isolation.
 */

const crypto = require('crypto');
const { Injectable } = require('../../../core/index.js');

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
    async create({ guildId, channelId, userId, category, subject }) {
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
            createdAt: now,
            updatedAt: now
        });
        return { id, status: STATUS.OPEN };
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
}

function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

Injectable()(TicketService);

module.exports = { TicketService, STATUS };
