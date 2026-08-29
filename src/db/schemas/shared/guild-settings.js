/**
 * db/schemas/shared/guild-settings.js
 *
 * Tables de configuration multi-guild (Phase 0).
 *  - guildSettings : config par guilde (locale, timezone, premium, etc.)
 *
 * Note (Phase 8 du plan migrate-to-c12) : la table `feature_flags`
 * a été supprimée (la config des features est maintenant dans des
 * fichiers YAML via c12, cf. src/config/c12-loader.js).
 */

const { pgTable, text, integer, bigint } = require('../_drizzle.js');

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

module.exports = { guildSettings };
