/**
 * src/db/index.js
 *
 * Barrel public de la couche DB. Réexporte :
 *  - la factory de connexion `initDatabase()` (cf. `client.js`)
 *  - le schema global Drizzle (cf. `schemas/index.js`)
 *
 * Historique : ce fichier contenait auparavant un DDL monolithique
 * (`PG_TABLES_DDL`) et un tableau de migrations ad-hoc. Ces responsabilités
 * ont été déplacées :
 *  - DDL → schémas Drizzle par module + `drizzle-kit` pour les migrations
 *  - bootstrap connexion → `client.js`
 *
 * Pour la rétrocompatibilité, les exports legacy (`PG_TABLES_DDL`,
 * `initPgTables`, `createPGliteAdapter`) sont conservés comme **stubs**
 * qui lèvent une erreur explicite au moment de l'appel (pas à l'import).
 * Ils seront supprimés en étape 4.
 */

const { initDatabase, createTestDb, resetDatabase, dialect } = require('./client.js');
const schema = require('./schemas/index.js');

const dbContext = initDatabase(schema);

function _removed(name) {
    return function () {
        throw new Error(
            `[db] L'export legacy "${name}" a été supprimé lors de la migration vers ` +
            `drizzle-kit. Voir docs/plan/db-repository-split.md pour le plan de migration.`
        );
    };
}

module.exports = {
    ...dbContext,
    schema,
    dialect,
    initDatabase,
    createTestDb,
    resetDatabase,
    PG_TABLES_DDL: '',
    initPgTables: _removed('initPgTables'),
    createPGliteAdapter: _removed('createPGliteAdapter')
};
