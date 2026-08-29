/**
 * feature_xp-level/db/schema.js
 *
 * Tables Drizzle du module XP & Level.
 */

const { pgTable, text, integer, serial, uniqueIndex } = require('../../../db/schemas/_drizzle.js');
const { sql } = require('drizzle-orm');

const userXp = pgTable('user_xp', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    xp: integer('xp').default(0),
    level: integer('level').default(1),
    totalXpEarned: integer('total_xp_earned').default(0),
    messagesCount: integer('messages_count').default(0),
    voiceMinutes: integer('voice_minutes').default(0),
    eventsParticipated: integer('events_participated').default(0),
    lastMessageXp: text('last_message_xp'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

const xpTransactions = pgTable('xp_transactions', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    xpAmount: integer('xp_amount').notNull(),
    xpType: text('xp_type').notNull(),
    description: text('description'),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

const voiceSessions = pgTable('voice_sessions', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    channelId: text('channel_id').notNull(),
    channelName: text('channel_name').notNull(),
    joinTime: text('join_time').default(sql`CURRENT_TIMESTAMP`),
    leaveTime: text('leave_time'),
    durationMinutes: integer('duration_minutes').default(0),
    xpEarned: integer('xp_earned').default(0)
});

const events = pgTable('events', {
    id: serial('id').primaryKey(),
    eventName: text('event_name').notNull(),
    eventDescription: text('event_description'),
    eventDate: text('event_date'),
    xpReward: integer('xp_reward').default(0),
    createdBy: text('created_by'),
    isActive: integer('is_active').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

const eventParticipants = pgTable('event_participants', {
    id: serial('id').primaryKey(),
    eventId: integer('event_id').notNull(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    xpEarned: integer('xp_earned').default(0),
    joinedAt: text('joined_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
    uniqueIndex('idx_pg_event_user').on(table.eventId, table.userId)
]);

module.exports = { userXp, xpTransactions, voiceSessions, events, eventParticipants };
