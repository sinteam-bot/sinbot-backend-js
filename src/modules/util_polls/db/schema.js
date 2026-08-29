/**
 * feature_engagement/db/schema.js
 *
 * Tables Drizzle du module Engagement (giveaways, polls, reminders,
 * word triggers, custom commands).
 */

const { pgTable, text, integer, bigint, primaryKey, index, unique } = require('../../../db/schemas/_drizzle.js');

const giveaways = pgTable('giveaways', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id'),
    hostId: text('host_id').notNull(),
    prize: text('prize').notNull(),
    description: text('description'),
    winnersCount: integer('winners_count').notNull().default(1),
    requiredRoleId: text('required_role_id'),
    startsAt: bigint('starts_at', { mode: 'number' }).notNull(),
    endsAt: bigint('ends_at', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('active'),
    winnersJson: text('winners_json'),
    color: text('color'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_giveaways_guild_status').on(table.guildId, table.status),
    index('idx_pg_giveaways_ends_at').on(table.endsAt),
    index('idx_pg_giveaways_channel').on(table.channelId)
]);

const giveawayEntries = pgTable('giveaway_entries', {
    giveawayId: text('giveaway_id').notNull(),
    userId: text('user_id').notNull(),
    enteredAt: bigint('entered_at', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.giveawayId, table.userId] }),
    index('idx_pg_giveaway_entries_user').on(table.userId)
]);

const polls = pgTable('polls', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id'),
    question: text('question').notNull(),
    optionsJson: text('options_json').notNull(),
    multiChoice: integer('multi_choice').notNull().default(0),
    anonymous: integer('anonymous').notNull().default(0),
    endsAt: bigint('ends_at', { mode: 'number' }),
    status: text('status').notNull().default('active'),
    createdBy: text('created_by').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_polls_guild_status').on(table.guildId, table.status),
    index('idx_pg_polls_message').on(table.messageId)
]);

const pollVotes = pgTable('poll_votes', {
    pollId: text('poll_id').notNull(),
    userId: text('user_id').notNull(),
    optionIndex: integer('option_index').notNull(),
    votedAt: bigint('voted_at', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.pollId, table.userId, table.optionIndex] }),
    index('idx_pg_poll_votes_poll').on(table.pollId)
]);

const reminders = pgTable('reminders', {
    id: text('id').primaryKey(),
    guildId: text('guild_id'),
    channelId: text('channel_id'),
    userId: text('user_id').notNull(),
    reminderText: text('reminder_text').notNull(),
    fireAt: bigint('fire_at', { mode: 'number' }).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('pending'),
    sourceMessageId: text('source_message_id')
}, (table) => [
    index('idx_pg_reminders_status').on(table.status, table.fireAt),
    index('idx_pg_reminders_user').on(table.userId, table.status, table.fireAt)
]);

const wordTriggers = pgTable('word_triggers', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    triggerText: text('trigger_text').notNull(),
    matchType: text('match_type').notNull().default('exact'),
    responseText: text('response_text'),
    responseEmbedJson: text('response_embed_json'),
    excludeChannelIdsJson: text('exclude_channel_ids_json'),
    excludeRoleIdsJson: text('exclude_role_ids_json'),
    cooldownSeconds: integer('cooldown_seconds').notNull().default(10),
    createdBy: text('created_by'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_word_triggers_guild').on(table.guildId)
]);

const customCommands = pgTable('custom_commands', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    responseText: text('response_text'),
    responseEmbedJson: text('response_embed_json'),
    restrictChannelIdsJson: text('restrict_channel_ids_json'),
    restrictRoleIdsJson: text('restrict_role_ids_json'),
    cooldownSeconds: integer('cooldown_seconds').notNull().default(5),
    createdBy: text('created_by'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    unique('idx_pg_custom_commands_unique').on(table.guildId, table.name),
    index('idx_pg_custom_commands_guild').on(table.guildId)
]);

module.exports = {
    giveaways, giveawayEntries, polls, pollVotes, reminders, wordTriggers, customCommands
};
