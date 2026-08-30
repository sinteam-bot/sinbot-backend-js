/**
 * src/modules/util_tags/db/schema.js
 *
 * Schéma Drizzle pour les tags et réponses préenregistrées.
 */

const { pgTable, text, integer, bigint, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const tags = pgTable('tags', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    content: text('content').notNull(),
    uses: integer('uses').notNull().default(0),
    createdBy: text('created_by'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('tags_guild_name_unique').on(table.guildId, table.name),
    index('idx_tags_guild').on(table.guildId)
]);

module.exports = { tags };
