/**
 * src/modules/community_suggestions/db/schema.js
 *
 * Schéma Drizzle pour le module Suggestions.
 */

const { pgTable, text, integer, bigint, index, unique } = require('../../../db/schemas/_drizzle.js');

const suggestions = pgTable('suggestions', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    suggestionNumber: integer('suggestion_number').notNull(),
    content: text('content').notNull(),
    status: text('status').notNull().default('pending'),
    channelId: text('channel_id'),
    messageId: text('message_id'),
    staffId: text('staff_id'),
    staffReason: text('staff_reason'),
    upvotes: integer('upvotes').notNull().default(0),
    downvotes: integer('downvotes').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    unique('suggestions_guild_number_unique').on(table.guildId, table.suggestionNumber),
    index('idx_suggestions_guild_status').on(table.guildId, table.status),
    index('idx_suggestions_guild_number').on(table.guildId, table.suggestionNumber)
]);

module.exports = { suggestions };
