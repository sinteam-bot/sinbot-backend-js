/**
 * security_question/db/schema.js
 *
 * Tables Drizzle du module Captcha (security question + captcha).
 */

const { pgTable, text, integer, serial, uniqueIndex } = require('../../../db/schemas/_drizzle.js');
const { sql } = require('drizzle-orm');

const userCaptchas = pgTable('user_captchas', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    guildId: text('guild_id').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    channelId: text('channel_id').notNull(),
    attempts: integer('attempts').default(0),
    isVerified: integer('is_verified').default(0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text('expires_at'),
    verifiedAt: text('verified_at'),
    expiredAt: text('expired_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
    uniqueIndex('idx_pg_user_guild_captcha').on(table.userId, table.guildId)
]);

const captchaConfig = pgTable('captcha_config', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull().unique(),
    channelId: text('channel_id'),
    verifiedRoleId: text('verified_role_id'),
    timeoutMinutes: integer('timeout_minutes').default(10),
    maxAttempts: integer('max_attempts').default(3),
    isEnabled: integer('is_enabled').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

module.exports = { userCaptchas, captchaConfig };
