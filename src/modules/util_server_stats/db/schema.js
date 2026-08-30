/**
 * src/modules/util_server_stats/db/schema.js
 *
 * Schéma Drizzle pour les salons de statistiques du serveur.
 */

const { pgTable, text, bigint, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const serverStatsChannels = pgTable('server_stats_channels', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    statType: text('stat_type').notNull(),
    format: text('format').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('server_stats_guild_channel_unique').on(table.guildId, table.channelId),
    index('idx_server_stats_guild').on(table.guildId)
]);

module.exports = { serverStatsChannels };
