/**
 * feature_reports/db/schema.js
 *
 * Tables Drizzle du module Reports.
 */

const { pgTable, text, bigint, index } = require('../../../db/schemas/_drizzle.js');

const reports = pgTable('reports', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    reporterId: text('reporter_id').notNull(),
    reportedId: text('reported_id').notNull(),
    channelId: text('channel_id'),
    messageId: text('message_id'),
    reason: text('reason').notNull(),
    category: text('category').notNull().default('other'),
    status: text('status').notNull().default('open'),
    resolvedBy: text('resolved_by'),
    resolvedAt: bigint('resolved_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_reports_guild_status').on(table.guildId, table.status, table.createdAt),
    index('idx_pg_reports_reporter').on(table.guildId, table.reporterId, table.createdAt),
    index('idx_pg_reports_reported').on(table.guildId, table.reportedId, table.status)
]);

const reportActions = pgTable('report_actions', {
    id: text('id').primaryKey(),
    reportId: text('report_id').notNull(),
    staffId: text('staff_id').notNull(),
    action: text('action').notNull(),
    notes: text('notes'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_report_actions_report').on(table.reportId, table.createdAt)
]);

module.exports = { reports, reportActions };
