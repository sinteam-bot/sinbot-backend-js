/**
 * src/modules/util_autofeeds/services/autofeeds-reminder.service.js
 *
 * Alerte Sortie de Jeu & Rappel Personnel (« Préviens-moi à la date J »).
 * Gère l'abonnement des membres aux dates de sortie / sorties officielles
 * et l'envoi de notifications privées en DM le jour J.
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');
const { autofeedsRepository } = require('./autofeeds.repository.js');

class AutofeedsReminderService {
    constructor(repository = autofeedsRepository) {
        this.repository = repository;
    }

    /**
     * Tente de détecter une date de sortie au format ISO (YYYY-MM-DD) à partir d'un texte.
     * Supporte les formats : YYYY-MM-DD, DD/MM/YYYY, ainsi que les mois en français/anglais.
     * @param {string} text
     * @returns {string|null} Date au format YYYY-MM-DD ou null
     */
    detectReleaseDate(text) {
        if (!text || typeof text !== 'string') return null;

        // 1. Format ISO : 2026-10-25
        const isoMatch = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

        // 2. Format FR : 25/10/2026 ou 25-10-2026
        const frMatch = text.match(/\b(0[1-9]|[12]\d|3[01])[\/\-](0[1-9]|1[0-2])[\/\-](20\d{2})\b/);
        if (frMatch) return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;

        // 3. Format textuel FR : "25 octobre 2026", "15 nov 2026"
        const frenchMonths = {
            janvier: '01', janv: '01', jan: '01',
            février: '02', fevrier: '02', févr: '02', fev: '02',
            mars: '03', mar: '03',
            avril: '04', avr: '04',
            mai: '05',
            juin: '06',
            juillet: '07', juil: '07',
            août: '08', aout: '08',
            septembre: '09', sept: '09', sep: '09',
            octobre: '10', oct: '10',
            novembre: '11', nov: '11',
            décembre: '12', decembre: '12', déc: '12', dec: '12'
        };

        const monthRegex = new RegExp(
            `\\b(0?[1-9]|[12]\\d|3[01])\\s+(${Object.keys(frenchMonths).join('|')})\\s+(20\\d{2})\\b`,
            'i'
        );
        const textMatch = text.match(monthRegex);
        if (textMatch) {
            const day = textMatch[1].padStart(2, '0');
            const month = frenchMonths[textMatch[2].toLowerCase()];
            const year = textMatch[3];
            return `${year}-${month}-${day}`;
        }

        return null;
    }

    /**
     * Enregistre un rappel personnel de sortie.
     * @param {Object} params
     */
    async addReminder({ guildId, channelId = null, userId, historyId = null, releaseDate, reminderNote = null, feedName = null, itemTitle = null, itemUrl = null }) {
        if (!guildId || !userId || !releaseDate) {
            throw new Error('Paramètres obligatoires manquants (guildId, userId, releaseDate).');
        }

        // Si historyId est fourni, récupérer le titre/url si non fournis
        if (historyId && (!itemTitle || !itemUrl)) {
            const historyItem = await this.repository.getHistoryItemById(historyId);
            if (historyItem) {
                itemTitle = itemTitle || historyItem.title;
                itemUrl = itemUrl || historyItem.link;
                feedName = feedName || historyItem.feedName;
            }
        }

        const reminder = await this.repository.addReleaseReminder({
            guildId,
            channelId,
            userId,
            historyId,
            releaseDate,
            reminderNote,
            feedName,
            itemTitle: itemTitle || 'Événement / Sortie',
            itemUrl
        });

        return reminder;
    }

    /**
     * Récupère la liste des rappels actifs d'un utilisateur.
     */
    async getUserReminders(userId, guildId = null) {
        return this.repository.getUserReleaseReminders(userId, guildId);
    }

    /**
     * Construit le bouton Discord pour demander un rappel.
     */
    createReminderButton(historyId) {
        return new ButtonBuilder()
            .setCustomId(`feed_remind:${historyId}`)
            .setLabel('⏰ Rappel Sortie')
            .setEmoji('⏰')
            .setStyle(ButtonStyle.Secondary);
    }

    /**
     * Construit l'embed de notification pour le rappel de sortie.
     */
    buildReminderEmbed({ itemTitle, releaseDate, itemUrl, feedName }) {
        return new EmbedBuilder()
            .setColor(0xFEE75C) // Jaune doré événement
            .setTitle(`⏰ C'EST LE JOUR J : ${itemTitle || 'Sortie officielle'}`)
            .setURL(itemUrl || 'https://discord.com')
            .setDescription(`Aujourd'hui (${releaseDate}), l'événement ou le jeu pour lequel vous aviez demandé un rappel est officiellement disponible !`)
            .addFields(
                { name: '📅 Date de sortie', value: `\`${releaseDate}\``, inline: true },
                { name: '📰 Source', value: feedName || 'Flux d\'actualités', inline: true }
            )
            .setFooter({ text: 'Alerte Sortie & Rappel Personnel • Chienne Bot' })
            .setTimestamp();
    }

    /**
     * Vérifie et envoie en DM les rappels échus (date du jour <= releaseDate).
     * @param {import('discord.js').Client} client
     */
    async processDueReminders(client) {
        if (!client) return { processed: 0, sent: 0, errors: 0 };

        const dueReminders = await this.repository.listDueReleaseReminders();
        if (!dueReminders || dueReminders.length === 0) {
            return { processed: 0, sent: 0, errors: 0 };
        }

        let sent = 0;
        let errors = 0;

        for (const rem of dueReminders) {
            try {
                const user = client.users?.fetch ? await client.users.fetch(rem.userId).catch(() => null) : null;
                if (user && user.send) {
                    const embed = this.buildReminderEmbed({
                        itemTitle: rem.itemTitle,
                        releaseDate: rem.releaseDate,
                        itemUrl: rem.itemUrl,
                        feedName: rem.feedName
                    });

                    await user.send({
                        content: `🔔 **Rappel Personnel :** Votre événement tant attendu est arrivé !`,
                        embeds: [embed]
                    }).catch(() => null);
                    sent++;
                }

                await this.repository.markReleaseReminderNotified(rem.id);
            } catch (err) {
                logger.warn(`[AutofeedsReminder] Erreur envoi rappel ${rem.id}: ${err.message}`, 'AUTOFEEDS_REMINDER');
                errors++;
            }
        }

        return { processed: dueReminders.length, sent, errors };
    }
}

const autofeedsReminderService = new AutofeedsReminderService();
Injectable()(AutofeedsReminderService);

module.exports = {
    AutofeedsReminderService,
    autofeedsReminderService
};
