/**
 * src/modules/util_teamspeak/controllers/teamspeak.controller.js
 *
 * Contrôleur API REST pour TeamSpeak 3 (/api/teamspeak).
 */

const { Controller, Get, Post, Patch } = require('../../../core/index.js');
const { TeamSpeakClientService } = require('../services/teamspeak-client.service.js');
const { TeamSpeakTreeService } = require('../services/teamspeak-tree.service.js');
const { TeamSpeakWidgetService } = require('../services/teamspeak-widget.service.js');
const { TeamSpeakLogsService } = require('../services/teamspeak-logs.service.js');
const { getFeatureConfig, setFeatureConfig } = require('../../../config/c12-loader.js');

class TeamSpeakController {
    static inject = [
        TeamSpeakClientService,
        TeamSpeakTreeService,
        TeamSpeakWidgetService,
        TeamSpeakLogsService
    ];

    constructor(clientService, treeService, widgetService, logsService) {
        this.clientService = clientService;
        this.treeService = treeService;
        this.widgetService = widgetService;
        this.logsService = logsService;
    }

    /**
     * GET /api/teamspeak/status?guild_id=
     */
    async getStatus(req) {
        try {
            const isOnline = this.clientService.isConnected();
            const serverInfo = this.clientService.getServerInfo();
            const channels = this.clientService._channels || [];
            const clients = this.clientService._clients || [];

            return {
                success: true,
                data: {
                    online: isOnline,
                    server: serverInfo,
                    channelCount: channels.length,
                    clientCount: clients.filter(c => c.type !== 1).length
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * GET /api/teamspeak/tree?guild_id=
     */
    async getTree(req) {
        try {
            const hideEmpty = req.query.hide_empty === 'true';
            await this.clientService.refreshCache().catch(() => {});

            const data = this.clientService.getTreeData();
            const tree = this.treeService.buildTree(data.channels, data.clients, {
                hideEmptyChannels: hideEmpty
            });

            return {
                success: true,
                data: {
                    ...tree,
                    serverInfo: data.serverInfo
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * GET /api/teamspeak/config?guild_id=
     */
    async getConfig(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID || 'default';
            const config = await getFeatureConfig(guildId, 'teamspeak');

            // Masquer le mot de passe pour la sécurité
            const sanitized = JSON.parse(JSON.stringify(config || {}));
            if (sanitized?.server?.password) {
                sanitized.server.password = '••••••••';
            }

            return { success: true, data: sanitized };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * PATCH /api/teamspeak/config
     */
    async updateConfig(req) {
        try {
            const guildId = req.body.guild_id || req.body.guildId || process.env.GUILD_ID || 'default';
            const patch = req.body || {};
            delete patch.guild_id;
            delete patch.guildId;

            // Si le mot de passe est masqué, ne pas écraser l'ancien
            if (patch?.server?.password === '••••••••') {
                delete patch.server.password;
            }

            const updated = await setFeatureConfig(guildId, 'teamspeak', patch);
            this.clientService.setConfig(updated);

            // Si nouveau mot de passe/hôte fourni, tenter la reconnexion
            if (patch.server) {
                await this.clientService.disconnect();
                await this.clientService.connect().catch(() => {});
            }

            return { success: true, data: updated };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * POST /api/teamspeak/refresh?guild_id=
     */
    async refresh(req) {
        try {
            const guildId = req.body.guild_id || req.query.guild_id || process.env.GUILD_ID || 'default';
            await this.clientService.refreshCache();
            const widgetRes = await this.widgetService.updateWidget(guildId);

            return {
                success: true,
                data: {
                    cacheRefreshed: true,
                    widgetResult: widgetRes
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * GET /api/teamspeak/logs?guild_id=&page=&limit=
     */
    async getLogs(req) {
        try {
            const guildId = req.query.guild_id || null;
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 50;

            const logs = await this.logsService.listLogs({ guildId, page, limit });
            return { success: true, data: logs };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/teamspeak')(TeamSpeakController);
Get('/status')(TeamSpeakController.prototype, 'getStatus');
Get('/tree')(TeamSpeakController.prototype, 'getTree');
Get('/config')(TeamSpeakController.prototype, 'getConfig');
Patch('/config')(TeamSpeakController.prototype, 'updateConfig');
Post('/refresh')(TeamSpeakController.prototype, 'refresh');
Get('/logs')(TeamSpeakController.prototype, 'getLogs');

module.exports = { TeamSpeakController };
