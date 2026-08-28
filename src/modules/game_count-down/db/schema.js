/**
 * game_count-down/db/schema.js
 *
 * Tables Drizzle du jeu Countdown.
 */

const { pgTable, text, integer, primaryKey } = require('../../../db/schemas/_drizzle.js');
const { sql } = require('drizzle-orm');

const countdownState = pgTable('countdown_state', {
    channelId: text('channel_id').primaryKey(),
    currentNumber: integer('current_number').default(900),
    errorCount: integer('error_count').default(0),
    isTrapActive: integer('is_trap_active').default(0),
    trapNumber: integer('trap_number'),
    lastUserId: text('last_user_id'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

const countdownScores = pgTable('countdown_scores', {
    channelId: text('channel_id').notNull(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    score: integer('score').default(0)
}, (table) => [
    primaryKey({ columns: [table.channelId, table.userId] })
]);

module.exports = { countdownState, countdownScores };
