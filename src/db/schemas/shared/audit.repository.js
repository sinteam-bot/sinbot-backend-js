/**
 * db/schemas/shared/audit.repository.js
 *
 * Repository transverse pour l'audit et la télémétrie du bot.
 * Utilise les tables `user_events`, `form_responses` (audit.js) et
 * `discord_events_archive` (audit.js).
 *
 * Le code est porté nativement depuis `src/db/legacy-bridge-impl.js`.
 */

const { eq, desc, and, or, sql, count, inArray } = require('drizzle-orm');
const { Repository } = require('../../../core/index.js');
const { db, schema } = require('../../index.js');
const { userEvents, formResponses, discordEventsArchive } = require('./audit.js');

class AuditRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
        this.logUserEvent = this.logUserEvent.bind(this);
        this.getUserEvents = this.getUserEvents.bind(this);
        this.saveFormResponse = this.saveFormResponse.bind(this);
        this.getGlobalStats = this.getGlobalStats.bind(this);
        this.archiveDiscordEvent = this.archiveDiscordEvent.bind(this);
        this.getDiscordEventsArchive = this.getDiscordEventsArchive.bind(this);
    }

    async logUserEvent(userId, username, eventType, eventData = null) {
        try {
            const database = this?.db || db;
            const payload = typeof eventData === 'object' && eventData !== null
                ? JSON.stringify(eventData)
                : (eventData ? String(eventData) : null);

            const [inserted] = await database.insert(userEvents)
                .values({
                    userId,
                    username,
                    eventType,
                    eventData: payload
                })
                .returning();

            return inserted;
        } catch (error) {
            console.error('❌ Erreur logUserEvent:', error);
            throw error;
        }
    }

    async getUserEvents(userId, limit = 50) {
        try {
            const database = this?.db || db;
            const rows = await database.select()
                .from(userEvents)
                .where(eq(userEvents.userId, userId))
                .orderBy(desc(userEvents.createdAt))
                .limit(limit);

            return rows.map(event => {
                let parsedData = event.eventData;
                if (parsedData && typeof parsedData === 'string') {
                    try {
                        parsedData = JSON.parse(parsedData);
                    } catch {
                        // Laisser tel quel si non JSON
                    }
                }
                return {
                    ...event,
                    event_data: parsedData,
                    user_id: event.userId,
                    event_type: event.eventType,
                    created_at: event.createdAt
                };
            });
        } catch (error) {
            console.error('❌ Erreur getUserEvents:', error);
            throw error;
        }
    }

    async saveFormResponse(userId, username, formName, responses) {
        try {
            const database = this?.db || db;
            const payload = typeof responses === 'object' && responses !== null
                ? JSON.stringify(responses)
                : String(responses);

            const [inserted] = await database.insert(formResponses)
                .values({
                    userId,
                    username,
                    formName,
                    responses: payload
                })
                .returning();

            return inserted;
        } catch (error) {
            console.error('❌ Erreur saveFormResponse:', error);
            throw error;
        }
    }

    async getGlobalStats() {
        try {
            const database = this?.db || db;
            const result = await database.select({
                eventType: userEvents.eventType,
                event_type: userEvents.eventType,
                count: count(),
                total_events: count(),
                total_users: sql`count(distinct ${userEvents.userId})`
            })
            .from(userEvents)
            .groupBy(userEvents.eventType)
            .orderBy(desc(count()));

            return result;
        } catch (error) {
            console.error('❌ Erreur getGlobalStats:', error);
            throw error;
        }
    }

    async archiveDiscordEvent(eventName, payload = {}) {
        try {
            const database = this?.db || db;
            const [archived] = await database.insert(discordEventsArchive)
                .values({
                    eventName,
                    guildId: payload.guildId || payload.guild_id || null,
                    targetId: payload.targetId || payload.target_id || null,
                    userId: payload.userId || payload.user_id || null,
                    username: payload.username || null,
                    summary: payload.summary || null,
                    dataJson: payload.data ? JSON.stringify(payload.data) : null
                })
                .returning();

            return archived;
        } catch (e) {
            console.error(`❌ Erreur archiveDiscordEvent(${eventName}):`, e.message);
        }
    }

    async getDiscordEventsArchive(options = {}) {
        try {
            const database = this?.db || db;
            const limit = parseInt(options.limit, 10) || 50;
            const page = parseInt(options.page, 10) || 1;
            const offset = (page - 1) * limit;

            const conditions = [];

            if (options.guildId) {
                conditions.push(eq(discordEventsArchive.guildId, options.guildId));
            }
            if (options.eventName) {
                conditions.push(eq(discordEventsArchive.eventName, options.eventName));
            }
            if (options.userId) {
                conditions.push(or(
                    eq(discordEventsArchive.userId, options.userId),
                    eq(discordEventsArchive.targetId, options.userId)
                ));
            }
            if (options.search) {
                const searchPattern = `%${options.search}%`;
                conditions.push(or(
                    sql`${discordEventsArchive.summary} ILIKE ${searchPattern}`,
                    sql`${discordEventsArchive.username} ILIKE ${searchPattern}`,
                    sql`${discordEventsArchive.eventName} ILIKE ${searchPattern}`
                ));
            }
            if (options.startDate) {
                conditions.push(sql`${discordEventsArchive.createdAt} >= ${options.startDate}`);
            }
            if (options.endDate) {
                conditions.push(sql`${discordEventsArchive.createdAt} <= ${options.endDate}`);
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            const [countResult] = await database.select({ count: count() })
                .from(discordEventsArchive)
                .where(whereClause);

            const total = countResult ? Number(countResult.count) : 0;

            const rows = await database.select()
                .from(discordEventsArchive)
                .where(whereClause)
                .orderBy(desc(discordEventsArchive.createdAt))
                .limit(limit)
                .offset(offset);

            return {
                events: rows.map(r => {
                    let parsedData = null;
                    if (r.dataJson) {
                        try {
                            parsedData = JSON.parse(r.dataJson);
                        } catch {
                            parsedData = r.dataJson;
                        }
                    }
                    return {
                        id: r.id,
                        event_name: r.eventName,
                        guild_id: r.guildId,
                        target_id: r.targetId,
                        user_id: r.userId,
                        username: r.username,
                        summary: r.summary,
                        data: parsedData,
                        created_at: r.createdAt
                    };
                }),
                total,
                offset,
                limit,
                page,
                totalPages: Math.ceil(total / limit)
            };
        } catch (e) {
            console.error('❌ Erreur getDiscordEventsArchive:', e.message);
            throw e;
        }
    }
}

Repository()(AuditRepository);

const auditRepository = new AuditRepository();
const logUserEvent = (userId, username, eventType, eventData) => auditRepository.logUserEvent(userId, username, eventType, eventData);
const getUserEvents = (userId, limit) => auditRepository.getUserEvents(userId, limit);
const saveFormResponse = (userId, username, formName, responses) => auditRepository.saveFormResponse(userId, username, formName, responses);
const getGlobalStats = () => auditRepository.getGlobalStats();
const archiveDiscordEvent = (eventName, payload) => auditRepository.archiveDiscordEvent(eventName, payload);
const getDiscordEventsArchive = (options) => auditRepository.getDiscordEventsArchive(options);

module.exports = {
    AuditRepository,
    auditRepository,
    logUserEvent,
    getUserEvents,
    saveFormResponse,
    getGlobalStats,
    archiveDiscordEvent,
    getDiscordEventsArchive
};
