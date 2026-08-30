/**
 * src/modules/util_embed_builder/db/schema.js
 *
 * Schéma Drizzle pour les embeds personnalisés persistants.
 */

const { pgTable, text, bigint, jsonb, index } = require('../../../db/schemas/_drizzle.js');

const customEmbeds = pgTable('custom_embeds', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id').notNull(),
    title: text('title'),
    description: text('description'),
    color: text('color'),
    fields: jsonb('fields'),
    footer: text('footer'),
    thumbnail: text('thumbnail'),
    image: text('image'),
    author: jsonb('author'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_custom_embeds_guild').on(table.guildId),
    index('idx_custom_embeds_message').on(table.guildId, table.messageId)
]);

module.exports = { customEmbeds };
