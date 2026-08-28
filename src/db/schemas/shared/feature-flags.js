/**
 * db/schemas/shared/feature-flags.js
 *
 * Tables de configuration multi-guild (Phase 0).
 *  - guildSettings : config par guilde (locale, timezone, premium, etc.)
 *  - featureFlags : activation par feature × par guilde
 */

const { pgTable, text, integer, bigint, primaryKey, index } = require('../_drizzle.js');

const guildSettings = pgTable('guild_settings', {
    guildId: text('guild_id').primaryKey(),
    name: text('name').notNull(),
    locale: text('locale').default('fr'),
    timezone: text('timezone').default('Europe/Paris'),
    ownerId: text('owner_id'),
    premiumTier: integer('premium_tier').default(0),
    joinedAt: bigint('joined_at', { mode: 'number' }).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
});

const featureFlags = pgTable('feature_flags', {
    guildId: text('guild_id').notNull(),
    featureName: text('feature_name').notNull(),
    enabled: integer('enabled').notNull().default(0),
    configJson: text('config_json').notNull().default('{}'),
    allowedRoles: text('allowed_roles').notNull().default('[]'),
    updatedBy: text('updated_by'),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.guildId, table.featureName] }),
    index('idx_pg_feature_flags_enabled').on(table.enabled)
]);

module.exports = { guildSettings, featureFlags };
