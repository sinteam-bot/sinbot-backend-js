/**
 * src/modules/automation_autothread/db/schema.js
 *
 * Schéma Drizzle pour le système d'Auto-Thread (Module P2).
 */

const { pgTable, text, bigint, integer, boolean, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const autothreadChannels = pgTable('autothread_channels', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    titleFormat: text('title_format').default('{author} - {message}').notNull(),
    introMessage: text('intro_message'),
    slowmodeSeconds: integer('slowmode_seconds').default(0).notNull(),
    autoPin: boolean('auto_pin').default(false).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('autothread_channels_guild_channel_unique').on(table.guildId, table.channelId),
    index('idx_autothread_channels_guild').on(table.guildId)
]);

const autothreads = pgTable('autothreads', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    parentChannelId: text('parent_channel_id').notNull(),
    threadId: text('thread_id').notNull(),
    starterMessageId: text('starter_message_id').notNull(),
    authorId: text('author_id').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('autothreads_thread_id_unique').on(table.threadId),
    index('idx_autothreads_guild').on(table.guildId),
    index('idx_autothreads_thread_id').on(table.threadId)
]);

module.exports = { autothreadChannels, autothreads };
