/**
 * feature_automod/db/schema.js
 *
 * Tables Drizzle du module Automod (warnings, sanctions, logs).
 */

const { pgTable, text, integer, bigint, index } = require('../../../db/schemas/_drizzle.js');

const userWarnings = pgTable('user_warnings', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    modId: text('mod_id').notNull(),
    reason: text('reason').notNull(),
    source: text('source').notNull().default('manual'),
    rule: text('rule'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }),
    active: integer('active').notNull().default(1)
}, (table) => [
    index('idx_pg_user_warnings_guild_user').on(table.guildId, table.userId),
    index('idx_pg_user_warnings_active').on(table.active)
]);

const userSanctions = pgTable('user_sanctions', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    reason: text('reason').notNull(),
    modId: text('mod_id').notNull(),
    durationMs: bigint('duration_ms', { mode: 'number' }),
    startsAt: bigint('starts_at', { mode: 'number' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }),
    revokedBy: text('revoked_by'),
    revokedAt: bigint('revoked_at', { mode: 'number' }),
    revokedReason: text('revoked_reason'),
    active: integer('active').notNull().default(1),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_user_sanctions_guild_user').on(table.guildId, table.userId),
    index('idx_pg_user_sanctions_active').on(table.active)
]);

const modLogs = pgTable('mod_logs', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    modId: text('mod_id'),
    action: text('action').notNull(),
    channelId: text('channel_id'),
    messageId: text('message_id'),
    reason: text('reason'),
    metadata: text('metadata'),
    source: text('source').notNull().default('manual'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_mod_logs_guild_created').on(table.guildId, table.createdAt),
    index('idx_pg_mod_logs_guild_user').on(table.guildId, table.userId)
]);

const eventLog = pgTable('event_log', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    eventType: text('event_type').notNull(),
    actorId: text('actor_id'),
    targetId: text('target_id'),
    channelId: text('channel_id'),
    metadata: text('metadata'),
    summary: text('summary'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_event_log_guild_type').on(table.guildId, table.eventType),
    index('idx_pg_event_log_guild_created').on(table.guildId, table.createdAt),
    index('idx_pg_event_log_actor').on(table.actorId),
    index('idx_pg_event_log_target').on(table.targetId)
]);

module.exports = { userWarnings, userSanctions, modLogs, eventLog };
