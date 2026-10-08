/**
 * src/modules/util_autofeeds/services/autofeeds-user-digest.service.js
 *
 * "Mon Journal Privé" — Morning Briefing Personnel en DM.
 * Permet aux membres de planifier un horaire matinal pour recevoir
 * leur condensé quotidien personnalisé en message privé sur Discord.
 */

const { EmbedBuilder } = require('discord.js');
const { logger } = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');
const { autofeedsRepository } = require('./autofeeds.repository.js');

class AutofeedsUserDigestService {
    constructor(repository = autofeedsRepository) {
        this.repository = repository;
    }

    /**
     * Enregistre ou met à jour la planification d'un membre.
     * @param {string} guildId 
     * @param {string} userId 
     * @param {string} scheduleTime Format "HH:mm" (ex: "08:00")
     * @param {boolean} isEnabled 
     * @returns {Promise<Object>}
     */
    async setUserSchedule(guildId, userId, scheduleTime = '08:00', isEnabled = true) {
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduleTime)) {
            throw new Error('Format horaire invalide. Utilisez le format 24h "HH:mm" (ex: 08:30).');
        }

        return await this.repository.setUserDigest(guildId, userId, scheduleTime, isEnabled);
    }

    /**
     * Récupère la planification active d'un membre.
     * @param {string} guildId 
     * @param {string} userId 
     * @returns {Promise<Object|null>}
     */
    async getUserSchedule(guildId, userId) {
        return await this.repository.getUserDigest(guildId, userId);
    }

    /**
     * Construit l'embed du journal privé pour le membre.
     * @param {Object} params
     * @param {string} params.guildName
     * @param {Array<Object>} params.items
     * @returns {EmbedBuilder}
     */
    buildDigestEmbed({ guildName, items }) {
        const embed = new EmbedBuilder()
            .setTitle(`🌅 Ton Journal Privé — ${guildName}`)
            .setDescription(`Voici ta sélection personnalisée d'actualités des dernières 24 heures basée sur tes abonnements et centres d'intérêt !`)
            .setColor(0x5865F2)
            .setTimestamp();

        const topItems = items.slice(0, 6);
        for (const it of topItems) {
            const title = it.title ? it.title.slice(0, 100) : 'Sans titre';
            const link = it.link || '#';
            const summary = it.summary ? it.summary.slice(0, 150) : '';
            const fieldVal = summary ? `${summary}\n👉 [Lire l'article](${link})` : `👉 [Lire l'article](${link})`;

            embed.addFields({
                name: `📰 ${title}`,
                value: fieldVal,
                inline: false
            });
        }

        embed.setFooter({ text: `Tu peux modifier l'heure de ton briefing ou te désabonner avec /feed my-digest` });
        return embed;
    }

    /**
     * Vérifie et expédie les digests dus à l'instant T (ex: exécuté chaque minute).
     * @param {Object} client Discord Client
     * @param {string} [currentTime] "HH:mm" optionnel pour tester
     * @returns {Promise<number>} Nombre de briefings envoyés
     */
    async processDueDigests(client, currentTime = null) {
        if (!client) return 0;

        let timeStr = currentTime;
        if (!timeStr) {
            const now = new Date();
            const hours = String(now.getUTCHours()).padStart(2, '0');
            const minutes = String(now.getUTCMinutes()).padStart(2, '0');
            timeStr = `${hours}:${minutes}`;
        }

        const dueDigests = await this.repository.listDueUserDigests(timeStr);
        if (!dueDigests.length) return 0;

        let sentCount = 0;

        for (const digest of dueDigests) {
            try {
                const user = await client.users.fetch(digest.userId).catch(() => null);
                if (!user) continue;

                // Récupère les articles récents pertinents pour les tags/flux du user
                const recentItems = await this.repository.getRecentItemsForUserSubscriptions(
                    digest.guildId,
                    digest.userId,
                    24 // 24 heures
                );

                if (recentItems && recentItems.length > 0) {
                    const guild = client.guilds.cache.get(digest.guildId);
                    const guildName = guild ? guild.name : 'Serveur Discord';

                    const embed = this.buildDigestEmbed({
                        guildName,
                        items: recentItems
                    });

                    await user.send({ embeds: [embed] });
                    sentCount++;
                }

                // Met à jour la date de dernier envoi pour ne pas renvoyer dans la même journée/minute
                await this.repository.updateUserDigestLastSent(digest.id);
            } catch (err) {
                logger.warn(`[AutofeedsUserDigest] Échec envoi digest user ${digest.userId}: ${err.message}`, 'AUTOFEEDS_DIGEST');
                // Marquer quand même pour éviter boucle infinie d'erreurs
                await this.repository.updateUserDigestLastSent(digest.id).catch(() => null);
            }
        }

        return sentCount;
    }
}

Injectable()(AutofeedsUserDigestService);

const autofeedsUserDigestService = new AutofeedsUserDigestService();

module.exports = {
    AutofeedsUserDigestService,
    autofeedsUserDigestService
};
