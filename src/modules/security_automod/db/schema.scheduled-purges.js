/**
 * src/modules/security_automod/db/schema.scheduled-purges.js
 *
 * Schéma Drizzle pour les purges automatiques programmées (Phase 12 G39).
 */

const { pgTable, text, bigint, integer, boolean, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const scheduledPurges = pgTable('scheduled_purges', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    intervalHours: integer('interval_hours').notNull(),
    keepPinned: boolean('keep_pinned').default(true).notNull(),
    lastPurgeAt: bigint('last_purge_at', { mode: 'number' }).default(0).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('scheduled_purges_guild_channel_unique').on(table.guildId, table.channelId),
    index('idx_scheduled_purges_guild').on(table.guildId)
]);

module.exports = { scheduledPurges };
