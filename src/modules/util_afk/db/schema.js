/**
 * src/modules/util_afk/db/schema.js
 *
 * Schéma Drizzle pour le système AFK.
 */

const { pgTable, text, bigint, primaryKey, index } = require('../../../db/schemas/_drizzle.js');

const afkUsers = pgTable('afk_users', {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    reason: text('reason'),
    afkSince: bigint('afk_since', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.guildId, table.userId] }),
    index('idx_afk_users_guild').on(table.guildId)
]);

module.exports = { afkUsers };
