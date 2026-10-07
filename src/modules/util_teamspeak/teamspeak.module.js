/**
 * src/modules/util_teamspeak/teamspeak.module.js
 *
 * Point d'entrée du module TeamSpeak 3 (Widget arborescence & Logs).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { TeamSpeakClientService } = require('./services/teamspeak-client.service.js');
const { TeamSpeakTreeService } = require('./services/teamspeak-tree.service.js');
const { TeamSpeakWidgetService } = require('./services/teamspeak-widget.service.js');
const { TeamSpeakLogsService } = require('./services/teamspeak-logs.service.js');
const { TeamSpeakInteractionListener } = require('./events/teamspeak-interaction.listener.js');
const { TeamSpeakSyncCron } = require('./cron/teamspeak-sync.cron.js');
const { TeamSpeakCommands } = require('./commands/teamspeak.cmd.js');
const { TeamSpeakController } = require('./controllers/teamspeak.controller.js');
const logger = require('../../utils/logger.js');

featureRegistry.define('teamspeak', {
    defaults,
    aliases: ['ts3', 'teamspeak3', 'team-speak'],
    onEnable: async (guildId) => logger.info(`🔊 [teamspeak] enabled on ${guildId}`, 'TEAMSPEAK'),
    onDisable: async (guildId) => logger.info(`💤 [teamspeak] disabled on ${guildId}`, 'TEAMSPEAK')
});

class TeamSpeakModule {
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
        this._initialized = false;

        this._setupBindings();
    }

    /**
     * Relie les événements TeamSpeak au service de logs et au widget Discord.
     * @private
     */
    _setupBindings() {
        if (this._initialized) return;
        this._initialized = true;

        // 1. Branchement des événements client TS3 -> Logs & Widget
        this.clientService.on('clientconnect', async (ev) => {
            const client = ev.client || {};
            const nick = client.nickname || 'Utilisateur';

            // Trouver le nom du salon
            const ch = this.clientService._channels.find(c => String(c.cid) === String(client.cid));
            const channelName = ch ? ch.name : `Salon #${client.cid || '?'}`;

            await this._broadcastLog('ts3_client_connect', {
                nickname: nick,
                channelName,
                summary: `🟢 **${nick}** s'est connecté sur TeamSpeak (salon: ${channelName})`,
                metadata: { clid: client.clid, cid: client.cid }
            });

            this._scheduleAllWidgets();
        });

        this.clientService.on('clientdisconnect', async (ev) => {
            const client = ev.client || {};
            const nick = client.nickname || 'Utilisateur';
            const reason = ev.event?.reasonmsg || ev.reasonmsg || null;

            await this._broadcastLog('ts3_client_disconnect', {
                nickname: nick,
                reason: reason || 'Déconnexion normale',
                summary: `🔴 **${nick}** a quitté TeamSpeak${reason ? ` (${reason})` : ''}`,
                metadata: { clid: client.clid }
            });

            this._scheduleAllWidgets();
        });

        this.clientService.on('clientmoved', async (ev) => {
            const client = ev.client || {};
            const nick = client.nickname || 'Utilisateur';
            const toChannel = ev.channel ? ev.channel.name : 'un autre salon';

            await this._broadcastLog('ts3_client_moved', {
                nickname: nick,
                toChannel,
                summary: `🔄 **${nick}** s'est déplacé vers **${toChannel}**`,
                metadata: { clid: client.clid, channel: toChannel }
            });

            this._scheduleAllWidgets();
        });

        this.clientService.on('channelcreate', async (ev) => {
            const chName = ev.channel?.name || 'Nouveau salon';
            await this._broadcastLog('ts3_channel_create', {
                channelName: chName,
                summary: `📁 Nouveau salon créé : **${chName}**`
            });
            this._scheduleAllWidgets();
        });

        this.clientService.on('channeldelete', async (ev) => {
            await this._broadcastLog('ts3_channel_delete', {
                summary: `🗑️ Un salon a été supprimé (CID: ${ev.cid || '?'})`
            });
            this._scheduleAllWidgets();
        });

        // 2. Initialisation asynchrone de la connexion TS3
        setImmediate(async () => {
            try {
                const { container } = require('../../core/index.js');
                const discordClient = container.has('Client') ? container.resolve('Client') : null;
                if (discordClient) {
                    this.widgetService.setClient(discordClient);
                    this.logsService.setClient(discordClient);
                }

                // Charger la configuration globale par défaut
                const { getFeatureConfig } = require('../../config/c12-loader.js');
                const cfg = await getFeatureConfig('default', 'teamspeak').catch(() => null);
                if (cfg) {
                    this.clientService.setConfig(cfg);
                    this.logsService.setConfig(cfg.logs);
                }

                if (this.clientService.isConfigured()) {
                    await this.clientService.connect().catch(() => {});
                }
            } catch (err) {
                logger.warn(`[TeamSpeakModule] Erreur init: ${err.message}`, 'TEAMSPEAK');
            }
        });
    }

    /**
     * Diffuse un log vers toutes les guildes configurées.
     * @private
     */
    async _broadcastLog(eventType, data) {
        const discordClient = this.widgetService._client;
        if (discordClient?.guilds?.cache) {
            for (const [guildId] of discordClient.guilds.cache) {
                const cfg = await this.widgetService.getConfig(guildId);
                if (cfg?.enabled && cfg?.logs?.enabled) {
                    this.logsService.setConfig(cfg.logs);
                    await this.logsService.log(guildId, eventType, data);
                }
            }
        } else {
            await this.logsService.log('global', eventType, data);
        }
    }

    /**
     * Planifie l'actualisation des widgets Discord sur toutes les guildes.
     * @private
     */
    _scheduleAllWidgets() {
        const discordClient = this.widgetService._client;
        if (discordClient?.guilds?.cache) {
            for (const [guildId] of discordClient.guilds.cache) {
                this.widgetService.scheduleUpdate(guildId, 2000);
            }
        }
    }
}

Module({
    providers: [
        TeamSpeakClientService,
        TeamSpeakTreeService,
        TeamSpeakWidgetService,
        TeamSpeakLogsService,
        TeamSpeakInteractionListener,
        TeamSpeakSyncCron,
        TeamSpeakModule
    ],
    controllers: [TeamSpeakController],
    events: [TeamSpeakInteractionListener],
    commands: [TeamSpeakCommands]
})(TeamSpeakModule);

module.exports = { TeamSpeakModule };
