/**
 * src/modules/util_autofeeds/db/schema.js
 *
 * Schéma Drizzle pour les flux automatiques (Autofeeds) - Phase 14 G23.
 */

const { pgTable, text, bigint, integer, boolean, index } = require('../../../db/schemas/_drizzle.js');

const autofeeds = pgTable('autofeeds', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    feedUrl: text('feed_url').notNull(),
    feedType: text('feed_type').default('rss').notNull(),
    lastItemId: text('last_item_id'),
    lastItemPublishedAt: bigint('last_item_published_at', { mode: 'number' }).default(0).notNull(),
    intervalMinutes: integer('interval_minutes').default(15).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_autofeeds_guild').on(table.guildId)
]);

module.exports = { autofeeds };
