/**
 * feature_welcome/db/schema.js
 *
 * Tables Drizzle du module Welcome (config + cached SVG cards).
 */

const { pgTable, text, integer, bigint, serial, index } = require('../../../db/schemas/_drizzle.js');
const { sql } = require('drizzle-orm');

const welcomeConfig = pgTable('welcome_config', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull().unique(),
    welcomeChannelId: text('welcome_channel_id'),
    welcomeMessage: text('welcome_message'),
    autoRoles: text('auto_roles'),
    isEnabled: integer('is_enabled').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

const welcomeCards = pgTable('welcome_cards', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    template: text('template').notNull(),
    payload: text('payload').notNull(),
    svg: text('svg').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' })
}, (table) => [
    index('idx_pg_welcome_cards_user').on(table.guildId, table.userId, table.template)
]);

module.exports = { welcomeConfig, welcomeCards };
