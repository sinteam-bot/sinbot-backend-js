/**
 * src/modules/community_starboard/db/schema.js
 *
 * Schéma Drizzle pour le module Starboard.
 */

const { pgTable, text, integer, bigint, index, unique } = require('../../../db/schemas/_drizzle.js');

const starboardEntries = pgTable('starboard_entries', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    sourceChannelId: text('source_channel_id').notNull(),
    sourceMessageId: text('source_message_id').notNull(),
    starboardMessageId: text('starboard_message_id'),
    authorId: text('author_id').notNull(),
    reactionCount: integer('reaction_count').notNull().default(0),
    starredUsers: text('starred_users'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    unique('starboard_entries_guild_source_unique').on(table.guildId, table.sourceMessageId),
    index('idx_starboard_guild').on(table.guildId),
    index('idx_starboard_source').on(table.guildId, table.sourceMessageId)
]);

module.exports = { starboardEntries };
