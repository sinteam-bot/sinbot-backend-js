/**
 * src/modules/util_sticky_messages/db/schema.js
 *
 * Schéma Drizzle pour les messages persistants (Sticky Messages) - Phase 14 G28.
 */

const { pgTable, text, bigint, integer, jsonb, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const stickyMessages = pgTable('sticky_messages', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    content: text('content').notNull(),
    embedJson: jsonb('embed_json'),
    lastMessageId: text('last_message_id'),
    cooldownMessages: integer('cooldown_messages').default(1).notNull(),
    messageCountSincePost: integer('message_count_since_post').default(0).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('sticky_messages_guild_channel_unique').on(table.guildId, table.channelId),
    index('idx_sticky_messages_guild').on(table.guildId)
]);

module.exports = { stickyMessages };
