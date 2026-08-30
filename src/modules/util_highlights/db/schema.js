/**
 * src/modules/util_highlights/db/schema.js
 *
 * Schéma Drizzle pour les highlights / alertes mots-clés (Phase 14 G22).
 */

const { pgTable, text, bigint, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const userHighlights = pgTable('user_highlights', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    keyword: text('keyword').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('user_highlights_guild_user_keyword_unique').on(table.guildId, table.userId, table.keyword),
    index('idx_user_highlights_guild').on(table.guildId),
    index('idx_user_highlights_keyword').on(table.guildId, table.keyword)
]);

module.exports = { userHighlights };
