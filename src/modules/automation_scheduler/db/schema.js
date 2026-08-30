/**
 * src/modules/automation_scheduler/db/schema.js
 *
 * Schéma Drizzle pour les messages programmés.
 */

const { pgTable, text, integer, bigint, index } = require('../../../db/schemas/_drizzle.js');

const scheduledMessages = pgTable('scheduled_messages', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    name: text('name').notNull(),
    content: text('content'),
    embedJson: text('embed_json'),
    cronExpression: text('cron_expression'),
    intervalMinutes: integer('interval_minutes'),
    nextRunAt: bigint('next_run_at', { mode: 'number' }).notNull(),
    lastRunAt: bigint('last_run_at', { mode: 'number' }),
    enabled: integer('enabled').notNull().default(1),
    createdBy: text('created_by'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_scheduled_messages_guild').on(table.guildId),
    index('idx_scheduled_messages_due').on(table.enabled, table.nextRunAt)
]);

module.exports = { scheduledMessages };
