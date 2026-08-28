/**
 * src/db/client.js
 *
 * Factory de connexion Drizzle ORM. Isolé du barrel `db/index.js` pour
 * permettre de tester / instancier la connexion sans tirer tout l'agrégat.
 *
 * Drivers supportés :
 *  - `pg` (PostgreSQL 16 en production / staging)
 *  - `@electric-sql/pglite` (PostgreSQL 16 WASM in-memory, dev local + tests)
 */

const fs = require('fs');
const path = require('path');
const { drizzle: drizzlePg } = require('drizzle-orm/node-postgres');
const { drizzle: drizzlePgLite } = require('drizzle-orm/pglite');
const { Pool, types } = require('pg');
const { PGlite } = require('@electric-sql/pglite');
const { config } = require('../config/index.js');

// Parser les colonnes BIGINT (OID 20) en Number JavaScript pour éviter les strings
types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));

let _legacySchemaSql = null;
function _loadLegacySchema() {
    if (_legacySchemaSql !== null) return _legacySchemaSql;
    const p = path.join(__dirname, 'legacy-schema.sql');
    try {
        _legacySchemaSql = fs.readFileSync(p, 'utf8');
    } catch (e) {
        _legacySchemaSql = '';
        console.warn(`[db] legacy-schema.sql introuvable (${p}) — ${e.message}`);
    }
    return _legacySchemaSql;
}

let _db = null;
let _rawClient = null;
let _ready = null;
const dialect = 'postgres';

function _resolveCredentials() {
    const dbUrl = config.database_url || process.env.DATABASE_URL || process.env.DB_URL;
    const isTest = process.env.NODE_ENV === 'test';
    if (dbUrl) {
        return { kind: 'pg', connectionString: dbUrl };
    }
    if (isTest || !process.env.PG_HOST) {
        return { kind: 'pglite' };
    }
    return {
        kind: 'pg',
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        database: process.env.PG_DATABASE || 'botdb'
    };
}

function _createPGliteAdapter() {
    const client = new PGlite();

    const origQuery = client.query.bind(client);
    client.query = async function (queryInput, params = []) {
        if (typeof queryInput === 'object' && queryInput !== null) {
            return origQuery(queryInput.text, queryInput.values || []);
        }
        return origQuery(queryInput, params);
    };

    client.connect = async function () {
        return {
            query: client.query.bind(client),
            release: () => {}
        };
    };

    client.end = async function () {
        return client.close();
    };

    // En mode PGlite (dev/test), on instancie immédiatement le DDL legacy
    // pour préserver la compatibilité avec le code qui fait encore du SQL brut.
    // En production PostgreSQL, c'est `npm run db:migrate` qui s'en charge.
    const ddl = _loadLegacySchema();
    if (ddl) {
        client.ready = client.exec(ddl).catch((err) => {
            console.error('Erreur DDL PGlite (legacy-schema.sql):', err);
        });
    } else {
        client.ready = Promise.resolve();
    }

    return client;
}

/**
 * Crée un adaptateur PGlite (PostgreSQL 16 WASM in-memory).
 * @returns {Promise<{db, rawClient, pool, schema, dialect, isPostgres, isSqlite, ready}>}
 */
async function createPgliteContext(schema) {
    const client = _createPGliteAdapter();
    const dbInstance = drizzlePgLite(client, { schema });
    dbInstance.pool = client;
    return {
        db: dbInstance,
        rawClient: client,
        pool: client,
        schema,
        dialect,
        isPostgres: true,
        isSqlite: false,
        ready: Promise.resolve()
    };
}

/**
 * Crée un adaptateur PGlite **vierge** (n'instancie aucun DDL legacy).
 * Utilisé par les tests unitaires.
 */
async function createTestDb(schema) {
    return createPgliteContext(schema);
}

/**
 * Initialise la connexion Drizzle ORM globale.
 * Idempotent : retourner le contexte existant si déjà initialisé.
 *
 * En production, **n'exécute plus de DDL ni de migrations** : ces étapes
 * sont désormais gérées par `drizzle-kit` (`npm run db:migrate`).
 */
function initDatabase(schema) {
    if (_db) {
        return {
            db: _db,
            rawClient: _rawClient,
            pool: _rawClient,
            schema,
            dialect,
            isPostgres: true,
            isSqlite: false,
            ready: _ready
        };
    }

    const creds = _resolveCredentials();
    if (creds.kind === 'pglite') {
        _rawClient = _createPGliteAdapter();
        _db = drizzlePgLite(_rawClient, { schema });
        _ready = Promise.resolve();
    } else {
        const poolConfig = creds.connectionString
            ? { connectionString: creds.connectionString }
            : creds;
        _rawClient = new Pool(poolConfig);
        _db = drizzlePg(_rawClient, { schema });
        _ready = Promise.resolve();
    }

    if (_db) {
        _db.pool = _rawClient;
    }

    return {
        db: _db,
        rawClient: _rawClient,
        pool: _rawClient,
        schema,
        dialect,
        isPostgres: true,
        isSqlite: false,
        ready: _ready
    };
}

function resetDatabase() {
    _db = null;
    _rawClient = null;
    _ready = null;
}

module.exports = {
    initDatabase,
    createTestDb,
    createPgliteContext,
    resetDatabase,
    dialect
};
