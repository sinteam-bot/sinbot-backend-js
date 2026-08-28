/**
 * game_road-to-infinite/db/schema.js
 *
 * Tables Drizzle du jeu Road to Infinite.
 */

const { pgTable, text, integer } = require('../../../db/schemas/_drizzle.js');
const { sql } = require('drizzle-orm');

const counterState = pgTable('counter_state', {
    channelId: text('channel_id').primaryKey(),
    currentNumber: integer('current_number').default(0),
    errorCount: integer('error_count').default(0),
    lastUserId: text('last_user_id'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

module.exports = { counterState };
