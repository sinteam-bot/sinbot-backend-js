/**
 * feature_info/db/schema.js
 *
 * Tables Drizzle du module Info / Auth (sessions, audit logs, failed attempts).
 */

const { pgTable, text, integer, bigint, serial, index } = require('../../../db/schemas/_drizzle.js');

const authSessions = pgTable('auth_sessions', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    avatarUrl: text('avatar_url'),
    role: text('role').notNull().default('viewer'),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
    revokedAt: bigint('revoked_at', { mode: 'number' })
}, (table) => [
    index('idx_pg_auth_sessions_user').on(table.userId),
    index('idx_pg_auth_sessions_expires').on(table.expiresAt),
    index('idx_pg_auth_sessions_token_hash').on(table.refreshTokenHash)
]);

const authAuditLogs = pgTable('auth_audit_logs', {
    id: serial('id').primaryKey(),
    eventType: text('event_type').notNull(),
    userId: text('user_id'),
    username: text('username'),
    ipAddress: text('ip_address').notNull(),
    userAgent: text('user_agent'),
    reason: text('reason'),
    metadata: text('metadata'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_auth_audit_logs_ip').on(table.ipAddress, table.createdAt),
    index('idx_pg_auth_audit_logs_user').on(table.userId, table.createdAt),
    index('idx_pg_auth_audit_logs_type').on(table.eventType, table.createdAt)
]);

const authFailedAttempts = pgTable('auth_failed_attempts', {
    identifier: text('identifier').primaryKey(),
    attemptCount: integer('attempt_count').notNull().default(1),
    firstAttemptAt: bigint('first_attempt_at', { mode: 'number' }).notNull(),
    lastAttemptAt: bigint('last_attempt_at', { mode: 'number' }).notNull(),
    blockedUntil: bigint('blocked_until', { mode: 'number' })
}, (table) => [
    index('idx_pg_auth_failed_blocked').on(table.blockedUntil)
]);

module.exports = { authSessions, authAuditLogs, authFailedAttempts };
