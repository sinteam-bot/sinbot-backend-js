/**
 * src/modules/community_ranks/db/schema.js
 *
 * Schéma Drizzle pour les rangs et rôles auto-rejoignables.
 */

const { pgTable, text, bigint, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const ranks = pgTable('ranks', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    roleId: text('role_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('ranks_guild_name_unique').on(table.guildId, table.name),
    index('idx_ranks_guild').on(table.guildId)
]);

module.exports = { ranks };
