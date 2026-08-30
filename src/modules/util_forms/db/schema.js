/**
 * src/modules/util_forms/db/schema.js
 *
 * Schéma Drizzle pour les formulaires (Phase 14 G21).
 */

const { pgTable, text, bigint, jsonb, uniqueIndex, index } = require('../../../db/schemas/_drizzle.js');

const forms = pgTable('forms', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    channelId: text('channel_id').notNull(),
    questionsJson: jsonb('questions_json').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    uniqueIndex('forms_guild_name_unique').on(table.guildId, table.name),
    index('idx_forms_guild').on(table.guildId)
]);

const formSubmissions = pgTable('form_submissions', {
    id: text('id').primaryKey(),
    formId: text('form_id').notNull(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    answersJson: jsonb('answers_json').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_form_submissions_form').on(table.formId),
    index('idx_form_submissions_user').on(table.guildId, table.userId)
]);

module.exports = { forms, formSubmissions };
