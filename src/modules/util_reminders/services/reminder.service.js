/**
 * reminder.service.js — gestion des rappels
 *
 *   - createReminder({ userId, guildId, channelId, text, fireAt })
 *   - listByUser(userId)
 *   - cancel(id, userId)         : owner check
 *   - get(id)
 *   - tick()                       : cron-style, retourne les到期
 *   - dispatch(reminder, client)  : envoie le DM ou le message
 *
 * Le cooldowns est géré en mémoire (in-memory map par userId).
 */

const { Injectable } = require('../../../core/index.js');
const { RemindersRepository } = require('./reminders.repository.js');

class ReminderService {
    static inject = [RemindersRepository];

    constructor(repo) {
        this.repo = repo;
        this._client = null;
        this._cooldowns = new Map(); // key: `userId`, value: ts
    }

    setClient(client) { this._client = client; }

    async createReminder({ userId, guildId, channelId, text, fireAt }) {
        if (!userId || !text || !fireAt) {
            return { ok: false, error: 'missing_params' };
        }
        if (fireAt <= Date.now()) {
            return { ok: false, error: 'fire_at_in_past' };
        }
        // Cooldown simple : 5s minimum entre deux rappels
        const last = this._cooldowns.get(userId) || 0;
        if (Date.now() - last < 5000) {
            return { ok: false, error: 'cooldown' };
        }
        this._cooldowns.set(userId, Date.now());

        const created = await this.repo.insertReminder({
            guildId, channelId, userId,
            reminderText: text.slice(0, 500),
            fireAt
        });
        return { ok: true, data: created };
    }

    async listByUser(userId) {
        return this.repo.listReminders({ userId, status: 'pending', limit: 50 });
    }

    async cancel(id, userId) {
        const r = await this.repo.getReminder(id);
        if (!r) return { ok: false, error: 'not_found' };
        if (r.userId !== userId) return { ok: false, error: 'not_owner' };
        await this.repo.updateReminder(id, { status: 'cancelled' });
        return { ok: true };
    }

    async get(id) { return this.repo.getReminder(id); }

    /**
     * Cron tick : retourne les到期 et les marque done.
     * C'est la responsabilité du cron service d'appeler dispatch() après.
     */
    async tick() {
        const due = await this.repo.listDueReminders(50);
        for (const r of due) {
            await this.repo.updateReminder(r.id, { status: 'done' });
        }
        return due;
    }

    /**
     * Envoie le rappel à son destinataire
     */
    async dispatch(reminder, client) {
        const c = client || this._client;
        if (!c) return { ok: false, error: 'client_unavailable' };
        try {
            if (reminder.channelId) {
                const channel = await c.channels.fetch(reminder.channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    await channel.send({
                        content: `⏰ <@${reminder.userId}> **Rappel** : ${reminder.reminderText}`
                    });
                    return { ok: true, via: 'channel' };
                }
            }
            // Fallback : DM
            const user = await c.users.fetch(reminder.userId).catch(() => null);
            if (user) {
                await user.send({ content: `⏰ **Rappel** : ${reminder.reminderText}` });
                return { ok: true, via: 'dm' };
            }
            return { ok: false, error: 'user_unreachable' };
        } catch (err) {
            console.error(`[ReminderService] dispatch failed: ${err.message}`);
            return { ok: false, error: err.message };
        }
    }
}

Injectable()(ReminderService);

module.exports = { ReminderService };
