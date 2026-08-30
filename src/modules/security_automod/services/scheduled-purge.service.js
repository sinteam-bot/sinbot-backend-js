/**
 * src/modules/security_automod/services/scheduled-purge.service.js
 *
 * Service de purge programmée automatique pour salons Discord (Phase 12 G39).
 */

const { Injectable } = require('../../../core/index.js');
const { ScheduledPurgeRepository } = require('./scheduled-purge.repository.js');
const logger = require('../../../utils/logger.js');

class ScheduledPurgeService {
    static inject = [ScheduledPurgeRepository];

    constructor(repo) {
        this.repo = repo;
        this._intervalTimer = null;
    }

    async setupPurge({ guildId, channelId, intervalHours, keepPinned = true }) {
        if (!guildId || !channelId || !intervalHours || intervalHours <= 0) {
            return { ok: false, error: 'Paramètres invalides (intervalle en heures requis > 0)' };
        }

        const res = await this.repo.setupPurge({
            guildId,
            channelId,
            intervalHours: Math.max(1, parseInt(intervalHours, 10)),
            keepPinned
        });

        logger.info(`Purge programmée configurée sur <#${channelId}> toutes les ${intervalHours}h`, 'AUTOMOD');
        return { ok: true, data: res };
    }

    async listPurges(guildId) {
        return this.repo.listByGuild(guildId);
    }

    async deletePurge(guildId, channelId) {
        await this.repo.delete(guildId, channelId);
        return { ok: true };
    }

    async executeDuePurges(client) {
        try {
            const purges = await this.repo.listAll();
            const now = Date.now();

            for (const p of purges) {
                const intervalMs = p.intervalHours * 3600 * 1000;
                if (now - p.lastPurgeAt >= intervalMs) {
                    await this._purgeChannel(p, client);
                    await this.repo.updateLastPurge(p.id, now);
                }
            }
        } catch (err) {
            logger.warn(`Erreur executeDuePurges: ${err.message}`, 'AUTOMOD');
        }
    }

    async _purgeChannel(purgeConfig, client) {
        if (!client || !client.channels) return;
        try {
            const channel = client.channels.cache.get(purgeConfig.channelId) || await client.channels.fetch(purgeConfig.channelId).catch(() => null);
            if (!channel || !channel.messages) return;

            const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
            if (!messages || messages.size === 0) return;

            let toDelete = Array.from(messages.values());
            if (purgeConfig.keepPinned) {
                toDelete = toDelete.filter(m => !m.pinned);
            }

            if (toDelete.length > 0) {
                if (channel.bulkDelete) {
                    await channel.bulkDelete(toDelete, true).catch(err => {
                        logger.warn(`Erreur bulkDelete lors de la purge de ${channel.id}: ${err.message}`, 'AUTOMOD');
                    });
                }
                logger.info(`Purge programmée exécutée sur #${channel.name || channel.id} (${toDelete.length} messages supprimés)`, 'AUTOMOD');
            }
        } catch (err) {
            logger.warn(`Erreur purge salon ${purgeConfig.channelId}: ${err.message}`, 'AUTOMOD');
        }
    }

    start(client) {
        if (this._intervalTimer) return;
        this._intervalTimer = setInterval(() => {
            this.executeDuePurges(client).catch(() => {});
        }, 5 * 60 * 1000); // Check toutes les 5 minutes
    }

    stop() {
        if (this._intervalTimer) {
            clearInterval(this._intervalTimer);
            this._intervalTimer = null;
        }
    }
}

Injectable()(ScheduledPurgeService);

module.exports = { ScheduledPurgeService };
