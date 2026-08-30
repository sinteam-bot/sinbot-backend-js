/**
 * src/modules/community_timed_roles/db/schema.js
 *
 * Schéma Drizzle pour les rôles temporisés.
 */

const { pgTable, text, bigint, index } = require('../../../db/schemas/_drizzle.js');

const timedRoles = pgTable('timed_roles', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    roleId: text('role_id').notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_timed_roles_guild_user').on(table.guildId, table.userId),
    index('idx_timed_roles_expires').on(table.expiresAt)
]);

module.exports = { timedRoles };
