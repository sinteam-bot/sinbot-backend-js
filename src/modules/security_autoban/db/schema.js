/**
 * src/modules/security_autoban/db/schema.js
 *
 * Schéma Drizzle pour l'historique des actions autoban.
 */

const { pgTable, text, bigint, index } = require('../../../db/schemas/_drizzle.js');

const autobanLogs = pgTable('autoban_logs', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    userTag: text('user_tag'),
    reason: text('reason').notNull(),
    action: text('action').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_autoban_logs_guild').on(table.guildId),
    index('idx_autoban_logs_created').on(table.createdAt)
]);

module.exports = { autobanLogs };
