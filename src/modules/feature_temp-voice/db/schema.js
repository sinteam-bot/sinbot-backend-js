/**
 * feature_temp-voice/db/schema.js
 *
 * Tables Drizzle du module Temp Voice (Join-to-Create).
 */

const { pgTable, text, integer, bigint, index } = require('../../../db/schemas/_drizzle.js');

const tempVoiceConfig = pgTable('temp_voice_config', {
    guildId: text('guild_id').primaryKey(),
    categoryId: text('category_id'),
    format: text('format').notNull().default("{user}'s game"),
    deleteDelaySeconds: integer('delete_delay_seconds').notNull().default(5),
    maxPerGuild: integer('max_per_guild').notNull().default(0),
    lockedRoleId: text('locked_role_id'),
    joinChannelsJson: text('join_channels_json'),
    enabled: integer('enabled').notNull().default(0),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
});

const tempVoiceState = pgTable('temp_voice_state', {
    channelId: text('channel_id').primaryKey(),
    guildId: text('guild_id').notNull(),
    creatorId: text('creator_id'),
    lastEmptyAt: bigint('last_empty_at', { mode: 'number' }).notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_temp_voice_state_guild').on(table.guildId)
]);

module.exports = { tempVoiceConfig, tempVoiceState };
