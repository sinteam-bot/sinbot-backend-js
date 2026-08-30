/**
 * src/modules/util_afk/events/afk-message.listener.js
 *
 * Écouteur messageCreate pour gérer le retrait automatique d'AFK et les notifications de mentions (Phase 9 G06).
 */

const { OnEvent } = require('../../../core/index.js');
const { AfkService } = require('../services/afk.service.js');
const logger = require('../../../utils/logger.js');

class AfkMessageListener {
    static inject = [AfkService];

    constructor(afkService) {
        this.afkService = afkService;
    }

    async _isEnabled(guildId) {
        const { featureRegistry } = require('../../../core/feature-registry.js');
        const state = await featureRegistry.get(guildId, 'afk');
        return state.enabled;
    }

    async handle(message) {
        if (!message?.guild) return;
        if (message.author?.bot) return;

        const enabled = await this._isEnabled(message.guild.id);
        if (!enabled) return;

        const guildId = message.guild.id;
        const authorId = message.author.id;

        // 1. Vérifier si l'auteur du message était AFK
        try {
            const authorAfk = await this.afkService.clearAfk(guildId, authorId);
            if (authorAfk) {
                const elapsedSec = Math.floor(authorAfk.afkSince / 1000);
                await message.reply({
                    content: `👋 Bon retour <@${authorId}> ! J'ai retiré ton statut AFK (tu étais absent depuis <t:${elapsedSec}:R>).`
                }).catch(() => { });
            }
        } catch (err) {
            logger.warn(`Erreur retrait AFK: ${err.message}`, 'AFK');
        }

        // 2. Vérifier si des membres mentionnés sont AFK
        if (message.mentions?.users?.size > 0) {
            for (const [userId, user] of message.mentions.users) {
                if (userId === authorId || user.bot) continue;

                try {
                    const afk = await this.afkService.getAfk(guildId, userId);
                    if (afk) {
                        const elapsedSec = Math.floor(afk.afkSince / 1000);
                        const reasonStr = afk.reason ? ` : *${afk.reason}*` : '';
                        await message.reply({
                            content: `💤 **${user.displayName || user.username}** est actuellement absent(e)${reasonStr} (<t:${elapsedSec}:R>).`
                        }).catch(() => { });
                    }
                } catch (err) {
                    logger.warn(`Erreur mention AFK: ${err.message}`, 'AFK');
                }
            }
        }
    }
}

OnEvent('messageCreate', {
    configKey: 'features.afk',
    priority: 40
})(AfkMessageListener.prototype, 'handle');

module.exports = { AfkMessageListener };
