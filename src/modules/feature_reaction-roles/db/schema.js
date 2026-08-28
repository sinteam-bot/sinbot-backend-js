/**
 * feature_reaction-roles/db/schema.js
 *
 * Tables Drizzle du module Reaction Roles (v1 + v2 components).
 */

const { pgTable, text, bigint, index } = require('../../../db/schemas/_drizzle.js');

const reactionRoles = pgTable('reaction_roles', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id').notNull(),
    emoji: text('emoji').notNull().default(''),
    roleId: text('role_id').notNull().default(''),
    description: text('description'),
    mode: text('mode').notNull().default('toggle'),
    kind: text('kind').notNull().default('reaction'),
    metadata: text('metadata'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_reaction_roles_message').on(table.guildId, table.messageId),
    index('idx_pg_reaction_roles_guild').on(table.guildId),
    index('idx_pg_reaction_roles_kind').on(table.guildId, table.kind, table.messageId)
]);

module.exports = { reactionRoles };
