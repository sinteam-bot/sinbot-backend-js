/**
 * src/modules/util_server_stats/db/schema.js
 *
 * Schéma Drizzle pour les salons de statistiques et les statroles du serveur (P5).
 */

const { pgTable, text, integer, bigint, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const serverStatsChannels = pgTable('server_stats_channels', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    statType: text('stat_type').notNull(),
    format: text('format').notNull(),
    targetId: text('target_id'),
    timezone: text('timezone'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('server_stats_guild_channel_unique').on(table.guildId, table.channelId),
    index('idx_server_stats_guild').on(table.guildId)
]);

const statroles = pgTable('statroles', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    roleId: text('role_id').notNull(),
    type: text('type').notNull(), // 'messages', 'voice_minutes', 'days_in_guild'
    threshold: integer('threshold').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('statroles_guild_role_type_unique').on(table.guildId, table.roleId, table.type),
    index('idx_statroles_guild').on(table.guildId)
]);

module.exports = { serverStatsChannels, statroles };
