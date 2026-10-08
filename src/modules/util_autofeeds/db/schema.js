/**
 * src/modules/util_autofeeds/db/schema.js
 *
 * Schéma Drizzle pour les flux automatiques (Autofeeds), souscriptions et historique.
 */

const { pgTable, text, bigint, integer, boolean, index, unique } = require('../../../db/schemas/_drizzle.js');

const autofeeds = pgTable('autofeeds', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    feedUrl: text('feed_url').notNull(),
    name: text('name'),
    feedType: text('feed_type').default('rss').notNull(),
    category: text('category').default('general').notNull(),
    tags: text('tags').default('[]').notNull(), // JSON array
    filters: text('filters').default('{}').notNull(), // JSON object
    customMessage: text('custom_message'),
    color: text('color').default('#FF4500').notNull(),
    pingRoleId: text('ping_role_id'),
    lastItemId: text('last_item_id'),
    lastItemPublishedAt: bigint('last_item_published_at', { mode: 'number' }).default(0).notNull(),
    intervalMinutes: integer('interval_minutes').default(15).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    lastCheckedAt: bigint('last_checked_at', { mode: 'number' }).default(0).notNull(),
    lastStatus: text('last_status').default('ok').notNull(),
    lastError: text('last_error'),
    failCount: integer('fail_count').default(0).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' })
}, (table) => [
    index('idx_autofeeds_guild').on(table.guildId),
    index('idx_autofeeds_category').on(table.category)
]);

const autofeedSubscriptions = pgTable('autofeed_subscriptions', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    targetType: text('target_type').notNull(), // 'tag', 'category', 'feed', 'keyword', 'account'
    targetValue: text('target_value').notNull(), // 'steam', 'gaming', 'id_du_feed', 'PlayStation'
    notifyMode: text('notify_mode').default('mention').notNull(), // 'mention', 'dm'
    filters: text('filters').default('{}').notNull(), // JSON: { includeKeywords: [], excludeKeywords: [] }
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    unique('autofeed_subs_unique').on(table.guildId, table.userId, table.targetType, table.targetValue),
    index('idx_autofeed_subs_lookup').on(table.guildId, table.targetType, table.targetValue),
    index('idx_autofeed_subs_user').on(table.guildId, table.userId)
]);

const autofeedHistory = pgTable('autofeed_history', {
    id: text('id').primaryKey(),
    feedId: text('feed_id').notNull(),
    itemGuid: text('item_guid').notNull(),
    itemUrl: text('item_url'),
    itemTitle: text('item_title'),
    postedAt: bigint('posted_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_autofeed_hist_lookup').on(table.feedId, table.itemGuid)
]);

module.exports = {
    autofeeds,
    autofeedSubscriptions,
    autofeedHistory
};
