/**
 * src/modules/util_teamspeak/services/teamspeak-widget.service.js
 *
 * Service de gestion du message widget interactif persistant sur Discord.
 * Met à jour ou réédite l'embed avec l'arborescence des salons et utilisateurs.
 */

const { Injectable } = require('../../../core/index.js');
const { TeamSpeakClientService } = require('./teamspeak-client.service.js');
const { TeamSpeakTreeService } = require('./teamspeak-tree.service.js');
const { setFeatureConfig, getFeatureConfig } = require('../../../config/c12-loader.js');
const logger = require('../../../utils/logger.js');

class TeamSpeakWidgetService {
    static inject = [TeamSpeakClientService, TeamSpeakTreeService];

    constructor(clientService, treeService) {
        this.clientService = clientService;
        this.treeService = treeService;
        this._client = null;
        this._updateTimers = new Map();
    }

    /**
     * Définit le client Discord.
     * @param {import('discord.js').Client} client
     */
    setClient(client) {
        this._client = client;
    }

    /**
     * Récupère la configuration TeamSpeak d'une guilde ou globale.
     * @param {string} guildId
     * @returns {Promise<Object>}
     */
    async getConfig(guildId) {
        try {
            return await getFeatureConfig(guildId, 'teamspeak');
        } catch (err) {
            return {};
        }
    }

    /**
     * Met à jour le message widget sur Discord dans le salon configuré.
     * @param {string} guildId
     * @returns {Promise<Object>}
     */
    async updateWidget(guildId) {
        if (!this._client) {
            return { ok: false, error: 'Client Discord non initialisé' };
        }

        const config = await this.getConfig(guildId);
        const widgetConfig = config?.widget || {};

        if (widgetConfig.enabled === false) {
            return { ok: false, error: 'Widget désactivé' };
        }

        const channelId = widgetConfig.channel_id;
        if (!channelId) {
            return { ok: false, error: 'Aucun salon configuré pour le widget' };
        }

        const channel = await this._client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return { ok: false, error: `Salon Discord #${channelId} introuvable ou invalide` };
        }

        // Récupérer l'état actuel TS3 et construire l'arborescence
        const treeData = this.clientService.getTreeData();
        const treeResult = this.treeService.buildTree(treeData.channels, treeData.clients, widgetConfig);
        const embed = this.treeService.buildDiscordEmbed(treeResult, treeData.serverInfo, widgetConfig);
        const actionRow = this.treeService.buildActionRow(guildId, treeData.serverInfo);

        const messageId = widgetConfig.message_id;

        // 1. Si un ID de message existe, tenter de l'éditer
        if (messageId) {
            try {
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (message) {
                    await message.edit({
                        embeds: [embed],
                        components: [actionRow]
                    });
                    return { ok: true, messageId: message.id, action: 'edited' };
                }
            } catch (err) {
                logger.warn(`[TeamSpeakWidget] Erreur édition message ${messageId}: ${err.message}`, 'TEAMSPEAK');
            }
        }

        // 2. Si le message n'existe pas ou a été supprimé, en poster un nouveau
        try {
            const newMsg = await channel.send({
                embeds: [embed],
                components: [actionRow]
            });

            // Sauvegarder le nouvel ID dans la configuration de la guilde
            await setFeatureConfig(guildId, 'teamspeak', {
                widget: { message_id: newMsg.id }
            }).catch(err => {
                logger.warn(`[TeamSpeakWidget] Impossible de sauvegarder message_id: ${err.message}`, 'TEAMSPEAK');
            });

            return { ok: true, messageId: newMsg.id, action: 'created' };
        } catch (err) {
            logger.warn(`[TeamSpeakWidget] Erreur envoi nouveau widget: ${err.message}`, 'TEAMSPEAK');
            return { ok: false, error: err.message };
        }
    }

    /**
     * Planifie une mise à jour avec debounce (évite les spams API Discord en cas de mouvements multiples).
     * @param {string} guildId
     * @param {number} [delayMs=2000]
     */
    scheduleUpdate(guildId, delayMs = 2000) {
        if (!guildId) return;

        if (this._updateTimers.has(guildId)) {
            clearTimeout(this._updateTimers.get(guildId));
        }

        const timer = setTimeout(async () => {
            this._updateTimers.delete(guildId);
            await this.updateWidget(guildId).catch(() => {});
        }, delayMs);

        this._updateTimers.set(guildId, timer);
    }

    /**
     * Force une actualisation immédiate du cache et du widget.
     * @param {string} guildId
     */
    async refreshNow(guildId) {
        await this.clientService.refreshCache();
        return await this.updateWidget(guildId);
    }
}

Injectable()(TeamSpeakWidgetService);

module.exports = { TeamSpeakWidgetService };
