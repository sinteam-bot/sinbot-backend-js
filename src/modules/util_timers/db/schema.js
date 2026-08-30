/**
 * src/modules/util_timers/db/schema.js
 *
 * Schéma Drizzle pour les minuteries (Timers) - Phase 14 G24.
 */

const { pgTable, text, bigint, integer, boolean, index } = require('../../../db/schemas/_drizzle.js');

const userTimers = pgTable('user_timers', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    userId: text('user_id').notNull(),
    label: text('label').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    endsAt: bigint('ends_at', { mode: 'number' }).notNull(),
    notified: boolean('notified').default(false).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_user_timers_ends_at').on(table.endsAt, table.notified)
]);

module.exports = { userTimers };
