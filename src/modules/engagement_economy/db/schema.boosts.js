/**
 * src/modules/engagement_economy/db/schema.boosts.js
 *
 * Schéma Drizzle pour les boosts économiques (Phase 13 G11).
 */

const { pgTable, text, bigint, numeric, index } = require('../../../db/schemas/_drizzle.js');

const economyBoosts = pgTable('economy_boosts', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    multiplier: numeric('multiplier', { precision: 5, scale: 2 }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_economy_boosts_guild_user').on(table.guildId, table.userId),
    index('idx_economy_boosts_expires').on(table.expiresAt)
]);

module.exports = { economyBoosts };
