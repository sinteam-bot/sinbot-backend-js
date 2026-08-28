#!/usr/bin/env node
/**
 * scripts/mark-migrations-applied.js
 *
 * Marque toutes les migrations Drizzle comme appliquées sur une base existante.
 * Utile pour les bases qui ont été créées avant l'introduction de Drizzle
 * (DDL legacy) et dont les tables existent déjà en prod.
 *
 * Usage :
 *   node scripts/mark-migrations-applied.js
 *   FORCE=1 node scripts/mark-migrations-applied.js   # sans confirmation
 *
 * Crée la table `__drizzle_migrations` si elle n'existe pas, puis y insère
 * toutes les migrations du dossier `src/db/migrations/` avec le hash réel
 * du snapshot (lu depuis `meta/_journal.json`).
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');
const { config } = require('../src/config/index.js');
const { Client: PgClient } = require('pg');

const MIGRATIONS_FOLDER = path.join(__dirname, '..', 'src', 'db', 'migrations');
const META_FOLDER = path.join(MIGRATIONS_FOLDER, 'meta');
const JOURNAL = path.join(META_FOLDER, '_journal.json');

function sha256(s) {
    return crypto.createHash('sha256').update(s).digest('hex');
}

function loadJournal() {
    if (!fs.existsSync(JOURNAL)) {
        throw new Error(`Journal introuvable: ${JOURNAL}`);
    }
    return JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
}

function loadSnapshot(idx) {
    const padded = String(idx).padStart(4, '0');
    const snap = path.join(META_FOLDER, `${padded}_snapshot.json`);
    if (!fs.existsSync(snap)) {
        throw new Error(`Snapshot introuvable: ${snap}`);
    }
    return fs.readFileSync(snap, 'utf8');
}

async function main() {
    const dbUrl = config.database_url || process.env.DATABASE_URL || process.env.DB_URL;
    if (!dbUrl) {
        console.error('❌ DATABASE_URL non défini.');
        process.exit(1);
    }

    const journal = loadJournal();
    const entries = journal.entries || [];
    if (entries.length === 0) {
        console.log('Aucune migration à marquer.');
        return;
    }

    if (!process.env.FORCE) {
        console.log(`Cette opération va marquer ${entries.length} migration(s) comme appliquées.`);
        console.log('Les tables doivent déjà exister (sinon, lancez d\'abord les migrations manuellement).');
        console.log('Relancer avec FORCE=1 pour confirmer.');
        process.exit(0);
    }

    const pool = new Pool({ connectionString: dbUrl });
    const client = await pool.connect();
    try {
        // 1. Créer le schéma `drizzle` et la table de journal si manquants.
        // Drizzle stocke son journal dans `drizzle.__drizzle_migrations`
        // (convention pg-core/dialect.cjs).
        await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
                id SERIAL PRIMARY KEY,
                hash TEXT NOT NULL,
                created_at BIGINT
            )
        `);

        // 2. Pour chaque entrée, calculer le hash du snapshot et insérer
        for (const entry of entries) {
            const snapshot = loadSnapshot(entry.idx);
            const hash = sha256(snapshot);
            const existing = await client.query(
                `SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1 LIMIT 1`,
                [hash]
            );
            if (existing.rows.length > 0) {
                console.log(`= ${entry.tag} déjà marquée (hash: ${hash.slice(0, 12)}...)`);
                continue;
            }
            await client.query(
                `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
                 VALUES ($1, $2)`,
                [hash, entry.when || Date.now()]
            );
            console.log(`✓ ${entry.tag} marquée (hash: ${hash.slice(0, 12)}...)`);
        }
    } finally {
        client.release();
        await pool.end();
    }

    console.log(`\n✅ ${entries.length} migration(s) marquée(s) comme appliquées.`);
    console.log('Vous pouvez maintenant relancer le bot. Les INSERT dans invite_codes fonctionneront.');
}

main().catch((e) => {
    console.error('❌ Erreur:', e.message);
    process.exit(1);
});
