/**
 * feature_sticky-roles/db/schema.js
 *
 * Tables Drizzle du module Sticky Roles.
 */

const { pgTable, text, bigint, primaryKey, index } = require('../../../db/schemas/_drizzle.js');

const stickyRoles = pgTable('sticky_roles', {
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    roleId: text('role_id').notNull(),
    savedAt: bigint('saved_at', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.userId, table.guildId, table.roleId] }),
    index('idx_pg_sticky_roles_user').on(table.guildId, table.userId)
]);

module.exports = { stickyRoles };
