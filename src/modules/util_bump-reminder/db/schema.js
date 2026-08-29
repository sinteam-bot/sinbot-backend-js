/**
 * service_bump-reminder/db/schema.js
 *
 * Tables Drizzle du service Bump Reminder.
 */

const { pgTable, text, integer, serial } = require('../../../db/schemas/_drizzle.js');
const { sql } = require('drizzle-orm');

const bumpLogs = pgTable('bump_logs', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    userId: text('user_id'),
    username: text('username'),
    bumpedAt: text('bumped_at').default(sql`CURRENT_TIMESTAMP`),
    reminderSent: integer('reminder_sent').default(0),
    reminderSentAt: text('reminder_sent_at')
});

module.exports = { bumpLogs };
