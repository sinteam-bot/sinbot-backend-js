/**
 * src/modules/community_modmail/db/schema.js
 *
 * Schéma Drizzle pour le système ModMail (Module P3).
 */

const { pgTable, text, bigint, boolean, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const modmailThreads = pgTable('modmail_threads', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    channelId: text('channel_id').notNull(),
    status: text('status').default('open').notNull(), // 'open', 'closed'
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    closedAt: bigint('closed_at', { mode: 'number' }),
    closedBy: text('closed_by'),
    closeReason: text('close_reason')
}, (table) => [
    index('idx_modmail_threads_guild').on(table.guildId),
    index('idx_modmail_threads_user').on(table.userId),
    index('idx_modmail_threads_channel').on(table.channelId)
]);

const modmailMessages = pgTable('modmail_messages', {
    id: text('id').primaryKey(),
    threadId: text('thread_id').notNull(),
    senderType: text('sender_type').notNull(), // 'user', 'staff', 'system'
    senderId: text('sender_id').notNull(),
    senderName: text('sender_name').notNull(),
    content: text('content').notNull(),
    isAnonymous: boolean('is_anonymous').default(false).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_modmail_messages_thread').on(table.threadId)
]);

const modmailBans = pgTable('modmail_bans', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    reason: text('reason'),
    bannedBy: text('banned_by').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('modmail_bans_guild_user_unique').on(table.guildId, table.userId),
    index('idx_modmail_bans_guild').on(table.guildId)
]);

const modmailSnippets = pgTable('modmail_snippets', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    content: text('content').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('modmail_snippets_guild_name_unique').on(table.guildId, table.name),
    index('idx_modmail_snippets_guild').on(table.guildId)
]);

module.exports = {
    modmailThreads,
    modmailMessages,
    modmailBans,
    modmailSnippets
};
