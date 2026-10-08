/**
 * autofeeds-events.service.js
 * 
 * Synchronisation avec les Événements Programmés Discord (GuildScheduledEvents).
 * Détecte les dates de sortie, lancements, livestreams ou marathons à venir
 * et crée automatiquement les événements Discord natifs dans le serveur.
 */

const { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } = require('discord.js');
const logger = require('../../../utils/logger');

class AutofeedsEventsService {
    /**
     * Tente d'extraire une date future dans le titre ou le contenu d'un article.
     * @param {string} text
     * @param {string} [title]
     * @returns {Date|null}
     */
    extractUpcomingDate(text = '', title = '') {
        const fullContent = `${title || ''} ${text || ''}`.trim();
        if (!fullContent) return null;

        const now = Date.now();
        const minFutureTime = now + (30 * 60 * 1000); // Au moins 30 minutes dans le futur
        const maxFutureTime = now + (365 * 24 * 60 * 60 * 1000); // Max 1 an

        // 1. Format ISO explicite : 2026-10-25T18:00:00Z
        const isoMatch = fullContent.match(/\b([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2})?(?:Z|[+-][0-9]{2}:?[0-9]{2})?)\b/);
        if (isoMatch) {
            const parsed = new Date(isoMatch[1]);
            if (!isNaN(parsed.getTime()) && parsed.getTime() >= minFutureTime && parsed.getTime() <= maxFutureTime) {
                return parsed;
            }
        }

        // 2. Format standard : YYYY-MM-DD
        const dateMatch = fullContent.match(/\b(20[2-3][0-9])-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])\b/);
        if (dateMatch) {
            const [ , year, month, day ] = dateMatch;
            const parsed = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 18, 0, 0));
            if (!isNaN(parsed.getTime()) && parsed.getTime() >= minFutureTime && parsed.getTime() <= maxFutureTime) {
                return parsed;
            }
        }

        // 3. Format français : "25/10/2026"
        const frDateMatch = fullContent.match(/\b(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/(20[2-3][0-9])\b/);
        if (frDateMatch) {
            const [ , day, month, year ] = frDateMatch;
            const parsed = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 18, 0, 0));
            if (!isNaN(parsed.getTime()) && parsed.getTime() >= minFutureTime && parsed.getTime() <= maxFutureTime) {
                return parsed;
            }
        }

        // 4. Mois textuels en français ou anglais (ex: "25 octobre 2026" ou "October 25, 2026")
        const monthMap = {
            janvier: 0, january: 0, jan: 0,
            fevrier: 1, février: 1, february: 1, feb: 1,
            mars: 2, march: 2, mar: 2,
            avril: 3, april: 3, apr: 3,
            mai: 4, may: 4,
            juin: 5, june: 5, jun: 5,
            juillet: 6, july: 6, jul: 6,
            aout: 7, août: 7, august: 7, aug: 7,
            septembre: 8, september: 8, sep: 8, sept: 8,
            octobre: 9, october: 9, oct: 9,
            novembre: 10, november: 10, nov: 10,
            decembre: 11, décembre: 11, december: 11, dec: 11
        };

        const textualMatch = fullContent.match(/(?:sortie|release|disponible le|launch(?:ing)? on|le)?\s*([0-9]{1,2})\s+([a-zéû]+)\s+(20[2-3][0-9])/i);
        if (textualMatch) {
            const day = parseInt(textualMatch[1], 10);
            const mName = textualMatch[2].toLowerCase();
            const year = parseInt(textualMatch[3], 10);
            if (monthMap[mName] !== undefined && day >= 1 && day <= 31) {
                const parsed = new Date(Date.UTC(year, monthMap[mName], day, 18, 0, 0));
                if (!isNaN(parsed.getTime()) && parsed.getTime() >= minFutureTime && parsed.getTime() <= maxFutureTime) {
                    return parsed;
                }
            }
        }

        return null;
    }

    /**
     * Alias convivial pour extractUpcomingDate.
     */
    extractFutureEventDate(text = '', title = '') {
        return this.extractUpcomingDate(text, title);
    }

    /**
     * Méthode flexible de synchronisation d'événement programmé.
     */
    async syncScheduledEvent(param1, param2) {
        if (param1 && param1.guildId && param1.client) {
            const guild = param1.client.guilds?.cache?.get(param1.guildId)
                || (param1.client.guilds?.fetch ? await param1.client.guilds.fetch(param1.guildId).catch(() => null) : null);
            const item = {
                title: param1.title,
                summary: param1.description,
                contentSnippet: param1.description,
                url: param1.url,
                _overrideDate: param1.scheduledDate
            };
            return this.syncGuildScheduledEvent(guild, item);
        }
        return this.syncGuildScheduledEvent(param1, param2);
    }

    /**
     * Crée un événement Discord programmé (GuildScheduledEvent) si une date future est identifiée.
     * @param {import('discord.js').Guild} guild 
     * @param {Object} item 
     * @returns {Promise<{ created: boolean, reason?: string, event?: any }>}
     */
    async syncGuildScheduledEvent(guild, item) {
        if (!guild || !guild.scheduledEvents || !item) {
            return { created: false, reason: 'guild_or_events_unavailable' };
        }

        const upcomingDate = item._overrideDate || this.extractUpcomingDate(item.summary || item.contentSnippet || '', item.title || '');
        if (!upcomingDate) {
            return { created: false, reason: 'no_upcoming_date_found' };
        }

        const title = (item.title || 'Nouvel Événement').slice(0, 100);

        try {
            // Vérification anti-doublon d'événement
            const existingEvents = (typeof guild.scheduledEvents?.fetch === 'function')
                ? await guild.scheduledEvents.fetch().catch(() => null)
                : null;
            if (existingEvents) {
                const alreadyExists = existingEvents.some(e =>
                    e.name.toLowerCase() === title.toLowerCase() ||
                    (e.entityMetadata?.location && item.url && e.entityMetadata.location === item.url)
                );
                if (alreadyExists) {
                    return { created: false, reason: 'event_already_exists' };
                }
            }

            const endTime = new Date(upcomingDate.getTime() + (2 * 60 * 60 * 1000)); // +2 heures

            const createdEvent = await guild.scheduledEvents.create({
                name: title,
                scheduledStartTime: upcomingDate,
                scheduledEndTime: endTime,
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                entityMetadata: {
                    location: item.url ? item.url.slice(0, 100) : 'Annonce Autofeed'
                },
                description: (item.summary || item.contentSnippet || item.title || '').slice(0, 1000)
            });

            logger.info(`[AutofeedsEvents] Événement Discord créé avec succès: "${title}" le ${upcomingDate.toISOString()}`, 'AUTOFEEDS');

            return {
                created: true,
                event: createdEvent,
                scheduledStartTime: upcomingDate
            };
        } catch (err) {
            logger.warn(`[AutofeedsEvents] Erreur création événement: ${err.message}`, 'AUTOFEEDS');
            return { created: false, reason: err.message };
        }
    }
}

const autofeedsEventsService = new AutofeedsEventsService();

module.exports = {
    AutofeedsEventsService,
    autofeedsEventsService
};
