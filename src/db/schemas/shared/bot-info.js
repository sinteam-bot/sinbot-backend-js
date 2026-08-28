/**
 * db/schemas/shared/bot-info.js
 *
 * Tables de runtime du bot (état interne partagé entre plusieurs services).
 *  - botVersionState : KV store pour la version, le dernier message publié, etc.
 */

const { pgTable, text } = require('../_drizzle.js');
const { sql } = require('drizzle-orm');

const botVersionState = pgTable('bot_version_state', {
    key: text('key').primaryKey(),
    value: text('value'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

module.exports = { botVersionState };
