/**
 * db/schemas/shared/audit.js
 *
 * Tables d'audit transverses (utilisées par plusieurs modules / services).
 *  - userEvents / formResponses : télémétrie du bot
 *  - discordEventsArchive : archive des événements Discord capturés
 */

const { pgTable, text, serial, index } = require('../_drizzle.js');
const { sql } = require('drizzle-orm');

const userEvents = pgTable('user_events', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    eventType: text('event_type').notNull(),
    eventData: text('event_data'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

const formResponses = pgTable('form_responses', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    formName: text('form_name').notNull(),
    responses: text('responses'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

const discordEventsArchive = pgTable('discord_events_archive', {
    id: serial('id').primaryKey(),
    eventName: text('event_name').notNull(),
    guildId: text('guild_id'),
    targetId: text('target_id'),
    userId: text('user_id'),
    username: text('username'),
    summary: text('summary'),
    dataJson: text('data_json'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
    index('idx_pg_events_name').on(table.eventName),
    index('idx_pg_events_created').on(table.createdAt)
]);

module.exports = { userEvents, formResponses, discordEventsArchive };
