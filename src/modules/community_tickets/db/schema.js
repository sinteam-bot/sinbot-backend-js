/**
 * feature_tickets/db/schema.js
 *
 * Tables Drizzle du module Tickets avec support Multi-Panels, Ratings et Tags (P4).
 */

const { pgTable, text, integer, bigint, jsonb, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

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
    panelId: text('panel_id'),
    ratingScore: integer('rating_score'),
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

const ticketPanels = pgTable('ticket_panels', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    channelId: text('channel_id'),
    categoryId: text('category_id'),
    roleIds: text('role_ids').default('[]').notNull(),
    formQuestions: jsonb('form_questions'),
    buttonLabel: text('button_label').default('Ouvrir un ticket').notNull(),
    buttonEmoji: text('button_emoji').default('📩').notNull(),
    buttonStyle: text('button_style').default('Primary').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('ticket_panels_guild_name_unique').on(table.guildId, table.name),
    index('idx_ticket_panels_guild').on(table.guildId)
]);

const ticketRatings = pgTable('ticket_ratings', {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id').notNull(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    staffId: text('staff_id'),
    rating: integer('rating').notNull(),
    feedback: text('feedback'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('ticket_ratings_ticket_unique').on(table.ticketId),
    index('idx_ticket_ratings_guild').on(table.guildId),
    index('idx_ticket_ratings_staff').on(table.staffId)
]);

const ticketTags = pgTable('ticket_tags', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    content: text('content').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('ticket_tags_guild_name_unique').on(table.guildId, table.name),
    index('idx_ticket_tags_guild').on(table.guildId)
]);

module.exports = {
    tickets,
    ticketMessages,
    ticketPanels,
    ticketRatings,
    ticketTags
};
