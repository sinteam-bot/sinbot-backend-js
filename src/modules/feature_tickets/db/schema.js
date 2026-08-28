/**
 * feature_tickets/db/schema.js
 *
 * Tables Drizzle du module Tickets.
 */

const { pgTable, text, integer, bigint, index } = require('../../../db/schemas/_drizzle.js');

const tickets = pgTable('tickets', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    userId: text('user_id').notNull(),
    category: text('category').notNull().default('support'),
    subject: text('subject'),
    status: text('status').notNull().default('open'),
    claimedBy: text('claimed_by'),
    closedBy: text('closed_by'),
    closedAt: bigint('closed_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_tickets_guild_status').on(table.guildId, table.status),
    index('idx_pg_tickets_user').on(table.userId),
    index('idx_pg_tickets_channel').on(table.channelId)
]);

const ticketMessages = pgTable('ticket_messages', {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id').notNull(),
    authorId: text('author_id').notNull(),
    content: text('content'),
    attachments: text('attachments'),
    isStaff: integer('is_staff').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_ticket_messages_ticket').on(table.ticketId)
]);

module.exports = { tickets, ticketMessages };
