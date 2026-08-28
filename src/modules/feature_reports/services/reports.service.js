/**
 * reports.service.js — logique métier des signalements
 *
 * - create({guildId, reporterId, reportedId, channelId?, messageId?, reason, category?})
 * - list / get / resolve / dismiss
 * - addAction / listActions
 * - canReport(reporterId, reportedId, config)  : anti-spam
 * - stats(guildId) : compteurs par status
 */

const { Injectable } = require('../../../core/index.js');
const { ReportsRepository } = require('./reports.repository.js');

class ReportsService {
    static inject = [ReportsRepository];

    constructor(repo) {
        this.repo = repo;
    }

    /**
     * Crée un signalement.
     * Anti-spam : refuse si reporter === reported, ou si le même
     * reporter a déjà signalé le même user il y a moins de
     * cooldown_seconds.
     */
    async create({ guildId, reporterId, reportedId, channelId = null, messageId = null, reason, category = 'other', config = {} }) {
        if (!guildId || !reporterId || !reportedId) {
            return { ok: false, error: 'missing_params' };
        }
        if (reporterId === reportedId) {
            return { ok: false, error: 'cannot_report_self' };
        }
        if (!reason || !reason.trim()) {
            return { ok: false, error: 'reason_required' };
        }

        const cooldown = (config.cooldown_seconds || 300) * 1000;
        const last = await this.repo.lastByReporterAgainst(guildId, reporterId, reportedId);
        if (last && (Date.now() - last.createdAt) < cooldown) {
            return { ok: false, error: 'cooldown', lastAt: last.createdAt };
        }

        const maxOpen = config.max_open_per_user || 5;
        const openCount = await this.repo.countOpenAgainstUser(guildId, reportedId);
        if (openCount >= maxOpen) {
            return { ok: false, error: 'too_many_open_reports', count: openCount };
        }

        const created = await this.repo.insertReport({
            guildId, reporterId, reportedId, channelId, messageId,
            reason: reason.slice(0, 500), category: category || 'other'
        });
        return { ok: true, data: created };
    }

    async list(guildId, options = {}) {
        return this.repo.listReports({ guildId, ...options });
    }

    async get(id) {
        return this.repo.getReport(id);
    }

    /**
     * Résout un report : status=resolved, log une action, retourne l'event
     * @param {string} id report id
     * @param {string} staffId
     * @param {string} action 'warn'|'kick'|'ban'|'dismiss'|'custom'
     * @param {string} notes
     */
    async resolve(id, staffId, action, notes = null) {
        const report = await this.repo.getReport(id);
        if (!report) return { ok: false, error: 'not_found' };
        if (report.status !== 'open') return { ok: false, error: 'not_open' };
        const now = Date.now();
        await this.repo.updateReport(id, { status: 'resolved', resolved_by: staffId, resolved_at: now });
        await this.repo.insertAction({ reportId: id, staffId, action: action || 'custom', notes });
        return { ok: true, data: await this.repo.getReport(id) };
    }

    async dismiss(id, staffId, notes = null) {
        const report = await this.repo.getReport(id);
        if (!report) return { ok: false, error: 'not_found' };
        if (report.status !== 'open') return { ok: false, error: 'not_open' };
        const now = Date.now();
        await this.repo.updateReport(id, { status: 'dismissed', resolved_by: staffId, resolved_at: now });
        await this.repo.insertAction({ reportId: id, staffId, action: 'dismiss', notes });
        return { ok: true, data: await this.repo.getReport(id) };
    }

    async addAction(reportId, staffId, action, notes = null) {
        return this.repo.insertAction({ reportId, staffId, action, notes });
    }

    async listActions(reportId) {
        return this.repo.listActions(reportId);
    }

    /**
     * Statistiques par status
     */
    async stats(guildId) {
        const open = await this.repo.countByGuild(guildId, 'open');
        const resolved = await this.repo.countByGuild(guildId, 'resolved');
        const dismissed = await this.repo.countByGuild(guildId, 'dismissed');
        return { open, resolved, dismissed, total: open + resolved + dismissed };
    }
}

Injectable()(ReportsService);

module.exports = { ReportsService };
