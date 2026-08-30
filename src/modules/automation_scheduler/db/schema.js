/**
 * src/modules/automation_scheduler/db/schema.js
 *
 * Schéma Drizzle pour les messages programmés et templates rotatifs (P6 - Message Planner Bot).
 */

const { pgTable, text, integer, bigint, jsonb, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const scheduledMessages = pgTable('scheduled_messages', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    name: text('name').notNull(),
    content: text('content'),
    embedJson: text('embed_json'),
    cronExpression: text('cron_expression'),
    intervalMinutes: integer('interval_minutes'),
    timezone: text('timezone').default('UTC'),
    autoClean: integer('auto_clean').default(0).notNull(),
    lastMessageId: text('last_message_id'),
    templateId: text('template_id'),
    isOneTime: integer('is_one_time').default(0).notNull(),
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

const schedulerTemplates = pgTable('scheduler_templates', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    items: jsonb('items').notNull(), // array of strings or embed objects
    currentIndex: integer('current_index').default(0).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('scheduler_templates_guild_name_unique').on(table.guildId, table.name),
    index('idx_scheduler_templates_guild').on(table.guildId)
]);

module.exports = { scheduledMessages, schedulerTemplates };
