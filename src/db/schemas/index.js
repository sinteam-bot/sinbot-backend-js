/**
 * src/db/schemas/index.js
 *
 * Agrégat du schema Drizzle global.
 *
 * Pendant la migration (étape 1 → étape 4) : réexporte le `pg.js` legacy
 * pour préserver la compatibilité avec tous les call-sites existants.
 *
 * En étape 3 : ce fichier agrègera :
 *   - `db/schemas/shared/*.js` (cache Discord, audit, feature flags, guild settings)
 *   - `modules/<x>/db/schema.js` pour chaque module
 * Et `pg.js` sera supprimé.
 *
 * Forme finale : un objet `{ <tableName>: <pgTable>, ..., schema: { ... } }`
 * compatible avec `drizzle(client, { schema })`.
 */

const pgSchema = require('./legacy.js');

module.exports = pgSchema;
