/**
 * src/modules/util_teamspeak/cron/teamspeak-sync.cron.js
 *
 * Tâche Cron de synchronisation périodique pour TeamSpeak 3 (Heartbeat & Widget sync).
 */

const { Cron, Injectable } = require('../../../core/index.js');
const { TeamSpeakClientService } = require('../services/teamspeak-client.service.js');
const { TeamSpeakWidgetService } = require('../services/teamspeak-widget.service.js');
const logger = require('../../../utils/logger.js');

class TeamSpeakSyncCron {
    static inject = [TeamSpeakClientService, TeamSpeakWidgetService];

    constructor(clientService, widgetService) {
        this.clientService = clientService;
        this.widgetService = widgetService;
    }

    async run(client) {
        try {
            // S'assurer que le client Discord est injecté dans le widget
            if (client && !this.widgetService._client) {
                this.widgetService.setClient(client);
            }

            // Si non connecté mais configuré, tenter la connexion
            if (!this.clientService.isConnected()) {
                if (this.clientService.isConfigured()) {
                    await this.clientService.connect().catch(() => {});
                }
                return;
            }

            // Actualiser le cache
            await this.clientService.refreshCache().catch(() => {});

            // Si un client Discord est présent, actualiser les guildes
            if (client && client.guilds) {
                for (const [guildId] of client.guilds.cache) {
                    const cfg = await this.widgetService.getConfig(guildId);
                    if (cfg?.widget?.enabled && cfg?.widget?.channel_id) {
                        this.widgetService.scheduleUpdate(guildId, 500);
                    }
                }
            }
        } catch (err) {
            logger.warn(`[TeamSpeakSyncCron] Erreur cycle sync: ${err.message}`, 'TEAMSPEAK');
        }
    }
}

Injectable()(TeamSpeakSyncCron);
Cron('*/1 * * * *', { configKey: 'features.teamspeak' })(TeamSpeakSyncCron.prototype, 'run');

module.exports = { TeamSpeakSyncCron };
