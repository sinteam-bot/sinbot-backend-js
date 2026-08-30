/**
 * src/modules/util_timers/services/timers.service.js
 *
 * Service métier pour les minuteries (Phase 14 G24).
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { TimersRepository } = require('./timers.repository.js');
const logger = require('../../../utils/logger.js');

class TimersService {
    static inject = [TimersRepository];

    constructor(repo) {
        this.repo = repo;
        this._intervalTimer = null;
    }

    async createTimer({ guildId, channelId, userId, label, durationSeconds }) {
        if (!guildId || !channelId || !userId || !durationSeconds || durationSeconds <= 0) {
            return { ok: false, error: 'Durée invalide.' };
        }

        const activeList = await this.repo.listUserTimers(guildId, userId);
        if (activeList.length >= 10) {
            return { ok: false, error: 'Limite de 10 minuteries actives atteinte.' };
        }

        const timer = await this.repo.createTimer({
            guildId,
            channelId,
            userId,
            label: label ? label.trim() : 'Minuterie',
            durationSeconds: parseInt(durationSeconds, 10)
        });

        logger.info(`Timer ${timer.id} créé par ${userId} pour ${durationSeconds}s`, 'TIMERS');
        return { ok: true, data: timer };
    }

    async listTimers(guildId, userId) {
        return this.repo.listUserTimers(guildId, userId);
    }

    async cancelTimer(id, userId = null) {
        await this.repo.deleteTimer(id, userId);
        return { ok: true };
    }

    async processDueTimers(client) {
        try {
            const due = await this.repo.findDueTimers(50);
            for (const t of due) {
                await this._notifyTimer(t, client);
                await this.repo.markNotified(t.id);
            }
        } catch (err) {
            logger.warn(`Erreur processDueTimers: ${err.message}`, 'TIMERS');
        }
    }

    async _notifyTimer(timer, client) {
        if (!client || !client.channels) return;
        try {
            const channel = client.channels.cache.get(timer.channelId) || await client.channels.fetch(timer.channelId).catch(() => null);
            if (!channel || !channel.send) return;

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('⏰ Minuterie terminée !')
                .setDescription(`Rappel : **${timer.label}**\nDurée initiale : **${this._formatSeconds(timer.durationSeconds)}**`)
                .setTimestamp();

            await channel.send({
                content: `🔔 <@${timer.userId}>, ta minuterie est terminée !`,
                embeds: [embed]
            }).catch(() => {});
        } catch (err) {
            logger.warn(`Erreur envoi notification timer ${timer.id}: ${err.message}`, 'TIMERS');
        }
    }

    _formatSeconds(sec) {
        if (sec < 60) return `${sec}s`;
        if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60 ? `${sec % 60}s` : ''}`.trim();
        const hours = Math.floor(sec / 3600);
        const mins = Math.floor((sec % 3600) / 60);
        return `${hours}h ${mins ? `${mins}m` : ''}`.trim();
    }

    start(client) {
        if (this._intervalTimer) return;
        this._intervalTimer = setInterval(() => {
            this.processDueTimers(client).catch(() => {});
        }, 5000); // Check toutes les 5 secondes
    }

    stop() {
        if (this._intervalTimer) {
            clearInterval(this._intervalTimer);
            this._intervalTimer = null;
        }
    }
}

Injectable()(TimersService);

module.exports = { TimersService };
