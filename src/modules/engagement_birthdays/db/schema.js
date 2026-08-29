/**
 * feature_birthdays/db/schema.js
 *
 * Tables Drizzle du module Birthdays.
 */

const { pgTable, text, integer, bigint, serial, primaryKey, index } = require('../../../db/schemas/_drizzle.js');
const { sql } = require('drizzle-orm');

const userBirthdays = pgTable('user_birthdays', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    birthdate: text('birthdate').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

const birthdayGuildSettings = pgTable('birthday_guild_settings', {
    guildId: text('guild_id').primaryKey(),
    mode: text('mode').notNull().default('public'),
    announceChannelId: text('announce_channel_id'),
    announceHour: integer('announce_hour').notNull().default(9),
    announceTimezone: text('announce_timezone').notNull().default('Europe/Paris'),
    pingRoleId: text('ping_role_id'),
    messageTemplate: text('message_template').notNull().default('🎂 Joyeux anniversaire {user} !'),
    tempRoleId: text('temp_role_id'),
    enabled: integer('enabled').notNull().default(1),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
});

const birthdayVisibility = pgTable('birthday_visibility', {
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    enabled: integer('enabled').notNull().default(1),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.userId, table.guildId] }),
    index('idx_pg_birthday_visibility_user').on(table.userId)
]);

const birthdayChangeLog = pgTable('birthday_change_log', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    guildId: text('guild_id'),
    changeNumber: integer('change_number').notNull(),
    previousBirthdate: text('previous_birthdate'),
    newBirthdate: text('new_birthdate').notNull(),
    cooldownUntil: bigint('cooldown_until', { mode: 'number' }).notNull(),
    changedAt: bigint('changed_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_birthday_change_user').on(table.userId, table.guildId),
    index('idx_pg_birthday_change_until').on(table.cooldownUntil)
]);

const birthdayHistory = pgTable('birthday_history', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    age: integer('age'),
    messageId: text('message_id'),
    giftsGiven: text('gifts_given'),
    announcedAt: bigint('announced_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_birthday_history_user').on(table.userId, table.guildId, table.announcedAt),
    index('idx_pg_birthday_history_guild').on(table.guildId, table.announcedAt)
]);

module.exports = { userBirthdays, birthdayGuildSettings, birthdayVisibility, birthdayChangeLog, birthdayHistory };
