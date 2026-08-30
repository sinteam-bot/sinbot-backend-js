/**
 * src/modules/util_server_stats/controllers/server-stats.controller.js
 *
 * Contrôleur REST pour la gestion des compteurs de statistiques et statroles (P5).
 */

const { Controller, Get, Post, Delete, container } = require('../../../core/index.js');
const { ServerStatsService } = require('../services/server-stats.service.js');

class ServerStatsController {
    static inject = [ServerStatsService];

    constructor(statsService) {
        this.statsService = statsService;
    }

    _getClient() {
        return container.has('Client') ? container.resolve('Client') : null;
    }

    async listCounters(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.statsService.listChannels(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async registerCounter(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { channel_id, stat_type, format, target_id, timezone } = req.body || {};
            const res = await this.statsService.registerChannel({
                guildId,
                channelId: channel_id,
                statType: stat_type,
                format,
                targetId: target_id,
                timezone
            });
            return { success: true, data: res };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteCounter(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const channelId = req.params?.channelId;
            await this.statsService.deleteChannel(guildId, channelId);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async refreshCounters(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID;
            const client = this._getClient();
            if (client && guildId) {
                const guild = client.guilds.cache.get(guildId);
                if (guild) await this.statsService.updateGuildStats(guild);
            }
            return { success: true, message: 'Actualisation effectuée' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async setupCategory(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID;
            const client = this._getClient();
            if (!client || !guildId) return { success: false, error: 'Client Discord non disponible' };

            const guild = client.guilds.cache.get(guildId);
            if (!guild) return { success: false, error: 'Serveur introuvable' };

            const res = await this.statsService.setupDefaultCounters(guild);
            return { success: true, data: res };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // =================== STATROLES ===================

    async listStatroles(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.statsService.listStatroles(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async addStatrole(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { role_id, type, threshold } = req.body || {};
            const res = await this.statsService.addStatrole({
                guildId,
                roleId: role_id,
                type,
                threshold: parseInt(threshold, 10)
            });
            return { success: true, data: res };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteStatrole(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const id = req.params?.id;
            await this.statsService.deleteStatrole(guildId, id);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/server-stats')(ServerStatsController);
Get('/counters')(ServerStatsController.prototype, 'listCounters');
Post('/counters')(ServerStatsController.prototype, 'registerCounter');
Delete('/counters/:channelId')(ServerStatsController.prototype, 'deleteCounter');
Post('/counters/refresh')(ServerStatsController.prototype, 'refreshCounters');
Post('/counters/setup')(ServerStatsController.prototype, 'setupCategory');
Get('/statroles')(ServerStatsController.prototype, 'listStatroles');
Post('/statroles')(ServerStatsController.prototype, 'addStatrole');
Delete('/statroles/:id')(ServerStatsController.prototype, 'deleteStatrole');

module.exports = { ServerStatsController };
