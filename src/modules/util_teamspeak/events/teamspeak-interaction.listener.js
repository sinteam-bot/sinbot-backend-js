/**
 * src/modules/util_teamspeak/events/teamspeak-interaction.listener.js
 *
 * Listener pour gérer les interactions de boutons Discord liées à TeamSpeak (ex: Bouton Actualiser).
 */

const { OnEvent } = require('../../../core/index.js');
const { TeamSpeakWidgetService } = require('../services/teamspeak-widget.service.js');
const logger = require('../../../utils/logger.js');

class TeamSpeakInteractionListener {
    static inject = [TeamSpeakWidgetService];

    constructor(widgetService) {
        this.widgetService = widgetService;
    }

    async handle(interaction) {
        if (!interaction.isButton()) return;
        if (!interaction.customId?.startsWith('ts3:refresh:')) return;

        const parts = interaction.customId.split(':');
        const guildId = parts[2] || interaction.guildId;

        try {
            await interaction.deferUpdate().catch(() => {});
            await this.widgetService.refreshNow(guildId);
        } catch (err) {
            logger.warn(`[TeamSpeakInteraction] Erreur rafraîchissement widget: ${err.message}`, 'TEAMSPEAK');
        }
    }
}

OnEvent('interactionCreate')(TeamSpeakInteractionListener.prototype, 'handle');

module.exports = { TeamSpeakInteractionListener };
