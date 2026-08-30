/**
 * src/modules/community_confessions/db/schema.js
 *
 * Schéma Drizzle pour les confessions anonymes (Module P1).
 */

const { pgTable, text, bigint, integer, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const confessions = pgTable('confessions', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    number: integer('number').notNull(),
    authorId: text('author_id').notNull(),
    content: text('content').notNull(),
    imageUrl: text('image_url'),
    status: text('status').default('published').notNull(), // 'pending', 'published', 'rejected'
    channelId: text('channel_id'),
    messageId: text('message_id'),
    reviewMessageId: text('review_message_id'),
    parentConfessionId: text('parent_confession_id'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_confessions_guild').on(table.guildId),
    index('idx_confessions_guild_number').on(table.guildId, table.number)
]);

const confessionBans = pgTable('confession_bans', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    reason: text('reason'),
    bannedBy: text('banned_by').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('confession_bans_guild_user_unique').on(table.guildId, table.userId),
    index('idx_confession_bans_guild').on(table.guildId)
]);

module.exports = { confessions, confessionBans };
