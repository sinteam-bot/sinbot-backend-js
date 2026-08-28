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
    }

    async logUserEvent(userId, username, eventType, eventData = null) {
        try {
            const payload = typeof eventData === 'object' && eventData !== null
                ? JSON.stringify(eventData)
                : (eventData ? String(eventData) : null);

            const [inserted] = await this.db.insert(userEvents)
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
            const rows = await this.db.select()
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
            const payload = typeof responses === 'object' && responses !== null
                ? JSON.stringify(responses)
                : String(responses);

            const [inserted] = await this.db.insert(formResponses)
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
            const result = await this.db.select({
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
            const [archived] = await this.db.insert(discordEventsArchive)
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
            const limit = parseInt(options.limit, 10) || 50;
            const page = parseInt(options.page, 10) || 1;
            const offset = options.offset !== undefined ? parseInt(options.offset, 10) : (page - 1) * limit;

            const conditions = [];

            if (options.eventName) {
                if (options.eventName.endsWith('%')) {
                    const prefix = options.eventName.replace('%', '');
                    conditions.push(sql`${discordEventsArchive.eventName} LIKE ${prefix + '%'}`);
                } else {
                    conditions.push(eq(discordEventsArchive.eventName, options.eventName));
                }
            }

            if (options.category) {
                const catMap = {
                    channel: ['channelCreate', 'channelDelete', 'channelUpdate', 'channelPinsUpdate'],
                    role: ['roleCreate', 'roleDelete', 'roleUpdate'],
                    message: ['messageDelete', 'messageDeleteBulk', 'messageUpdate', 'messageReactionAdd', 'messageReactionRemove'],
                    guildMember: ['guildMemberAdd', 'guildMemberRemove', 'guildMemberUpdate', 'guildBanAdd', 'guildBanRemove'],
                    mod: ['guildBanAdd', 'guildBanRemove', 'guildMemberRemove', 'guildAuditLogEntryCreate'],
                    emoji: ['emojiCreate', 'emojiDelete', 'emojiUpdate', 'stickerCreate', 'stickerDelete', 'stickerUpdate'],
                    thread: ['threadCreate', 'threadDelete', 'threadUpdate', 'threadListSync', 'threadMembersUpdate']
                };
                const events = catMap[options.category];
                if (events && events.length > 0) {
                    conditions.push(inArray(discordEventsArchive.eventName, events));
                }
            }

            if (options.search) {
                const searchPattern = `%${options.search}%`;
                conditions.push(
                    or(
                        sql`LOWER(${discordEventsArchive.summary}) LIKE LOWER(${searchPattern})`,
                        sql`LOWER(${discordEventsArchive.username}) LIKE LOWER(${searchPattern})`,
                        sql`LOWER(${discordEventsArchive.eventName}) LIKE LOWER(${searchPattern})`
                    )
                );
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            let query = this.db.select().from(discordEventsArchive);
            if (whereClause) {
                query = query.where(whereClause);
            }

            const rows = await query
                .orderBy(desc(discordEventsArchive.createdAt))
                .limit(limit)
                .offset(offset);

            let countQuery = this.db.select({ total: count() }).from(discordEventsArchive);
            if (whereClause) {
                countQuery = countQuery.where(whereClause);
            }
            const [totalCountResult] = await countQuery;
            const total = Number(totalCountResult?.total) || 0;

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

module.exports = { AuditRepository };
