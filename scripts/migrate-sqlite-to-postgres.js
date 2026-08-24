#!/usr/bin/env node

/**
 * ==============================================================================
 * SCRIPT DE MIGRATION DE DONNÉES : SQLite vers PostgreSQL
 * Pour Chienne Discord Bot
 * ==============================================================================
 * Usage:
 *   node scripts/migrate-sqlite-to-postgres.js
 *   node scripts/migrate-sqlite-to-postgres.js --dry-run
 *   node scripts/migrate-sqlite-to-postgres.js --sqlite ./data/bot.db --pg postgres://user:pass@localhost:5432/botdb
 *   node scripts/migrate-sqlite-to-postgres.js --table user_xp
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Charger l'environnement
dotenv.config();

/**
 * Définition ordonnée des tables et de leurs clés de conflit pour l'insertion PostgreSQL
 */
const TABLES = [
    { name: 'bot_config', conflictKeys: ['key'] },
    { name: 'bot_state', conflictKeys: ['key'] },
    { name: 'bot_version_state', conflictKeys: ['key'] },
    { name: 'conversation_contexts', conflictKeys: ['channel_id'] },
    { name: 'welcome_config', conflictKeys: ['guild_id'] },
    { name: 'captcha_config', conflictKeys: ['guild_id'] },
    { name: 'user_birthdays', conflictKeys: ['user_id'] },
    { name: 'user_profiles', conflictKeys: ['user_id'] },
    { name: 'counter_state', conflictKeys: ['channel_id'] },
    { name: 'countdown_state', conflictKeys: ['channel_id'] },
    { name: 'countdown_scores', conflictKeys: ['channel_id', 'user_id'] },
    { name: 'user_xp', conflictKeys: ['user_id'] },
    { name: 'server_members', conflictKeys: ['user_id'] },
    { name: 'discord_users', conflictKeys: ['user_id'] },
    { name: 'discord_channels', conflictKeys: ['channel_id'] },
    { name: 'discord_threads', conflictKeys: ['thread_id'] },
    { name: 'discord_roles', conflictKeys: ['role_id'] },
    { name: 'discord_messages', conflictKeys: ['message_id'] },
    { name: 'openaimessages', conflictKeys: ['msgid'] },
    { name: 'guild_members_cache', conflictKeys: ['guild_id', 'user_id'] },
    { name: 'user_captchas', conflictKeys: ['user_id', 'guild_id'] },
    { name: 'captcha_logs', conflictKeys: ['user_id', 'guild_id'] },
    { name: 'events', conflictKeys: ['id'] },
    { name: 'event_participants', conflictKeys: ['event_id', 'user_id'] },
    { name: 'xp_transactions', conflictKeys: ['id'] },
    { name: 'voice_sessions', conflictKeys: ['id'] },
    { name: 'member_history', conflictKeys: ['id'] },
    { name: 'user_events', conflictKeys: ['id'] },
    { name: 'form_responses', conflictKeys: ['id'] },
    { name: 'role_assign_logs', conflictKeys: ['id'] },
    { name: 'moderation_logs', conflictKeys: ['id'] },
    { name: 'bump_logs', conflictKeys: ['id'] },
    { name: 'discord_events_archive', conflictKeys: ['id'] }
];

/**
 * Crée les tables PostgreSQL cibles si elles n'existent pas encore
 */
async function ensurePgTables(pgClient) {
    await pgClient.query(`
        CREATE TABLE IF NOT EXISTS user_events (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            event_type TEXT NOT NULL,
            event_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS form_responses (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            form_name TEXT NOT NULL,
            responses TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_birthdays (
            id SERIAL PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            birthdate DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_xp (
            id SERIAL PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            total_xp_earned INTEGER DEFAULT 0,
            messages_count INTEGER DEFAULT 0,
            voice_minutes INTEGER DEFAULT 0,
            events_participated INTEGER DEFAULT 0,
            last_message_xp TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS xp_transactions (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            xp_amount INTEGER NOT NULL,
            xp_type TEXT NOT NULL,
            description TEXT,
            metadata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS voice_sessions (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            channel_name TEXT NOT NULL,
            join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            leave_time TIMESTAMP,
            duration_minutes INTEGER DEFAULT 0,
            xp_earned INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            event_name TEXT NOT NULL,
            event_description TEXT,
            event_date TIMESTAMP,
            xp_reward INTEGER DEFAULT 0,
            created_by TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS event_participants (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            xp_earned INTEGER DEFAULT 0,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS server_members (
            id SERIAL PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            discriminator TEXT,
            tag TEXT,
            display_name TEXT,
            avatar_url TEXT,
            joined_at TEXT,
            account_created_at TEXT,
            is_bot INTEGER DEFAULT 0,
            rejoin_count INTEGER DEFAULT 0,
            left_at TEXT,
            roles TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS member_history (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            metadata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS welcome_config (
            id SERIAL PRIMARY KEY,
            guild_id TEXT UNIQUE NOT NULL,
            welcome_channel_id TEXT,
            welcome_message TEXT,
            auto_roles TEXT,
            is_enabled INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS openaimessages (
            id SERIAL PRIMARY KEY,
            msgid TEXT UNIQUE NOT NULL,
            prompt TEXT,
            instruction TEXT,
            model TEXT,
            tokeninput INTEGER DEFAULT 0,
            tokenoutput INTEGER DEFAULT 0,
            content TEXT,
            previousmsgid TEXT,
            rawdata TEXT,
            type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Assouplir les contraintes si la table existait déjà avec NOT NULL
        DO $$ 
        BEGIN 
            ALTER TABLE openaimessages ALTER COLUMN prompt DROP NOT NULL;
        EXCEPTION 
            WHEN OTHERS THEN NULL;
        END $$;

        DO $$ 
        BEGIN 
            ALTER TABLE openaimessages ALTER COLUMN model DROP NOT NULL;
        EXCEPTION 
            WHEN OTHERS THEN NULL;
        END $$;

        CREATE TABLE IF NOT EXISTS conversation_contexts (
            id SERIAL PRIMARY KEY,
            channel_id TEXT UNIQUE NOT NULL,
            context TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bot_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bot_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_profiles (
            id SERIAL PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            bio TEXT,
            custom_title TEXT,
            color TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS role_assign_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            role_id TEXT NOT NULL,
            role_name TEXT NOT NULL,
            action TEXT NOT NULL,
            assigned_by TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS guild_members_cache (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            roles TEXT,
            joined_at TIMESTAMP,
            PRIMARY KEY (guild_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS moderation_logs (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            action TEXT NOT NULL,
            moderator_id TEXT NOT NULL,
            moderator_username TEXT NOT NULL,
            target_id TEXT,
            target_username TEXT,
            reason TEXT,
            details TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_captchas (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            attempts INTEGER DEFAULT 0,
            is_verified INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            verified_at TIMESTAMP,
            expired_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, guild_id)
        );

        CREATE TABLE IF NOT EXISTS captcha_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            channel_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, guild_id)
        );

        CREATE TABLE IF NOT EXISTS captcha_config (
            id SERIAL PRIMARY KEY,
            guild_id TEXT UNIQUE NOT NULL,
            channel_id TEXT,
            verified_role_id TEXT,
            timeout_minutes INTEGER DEFAULT 10,
            max_attempts INTEGER DEFAULT 3,
            is_enabled INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bump_logs (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            user_id TEXT,
            username TEXT,
            bumped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reminder_sent INTEGER DEFAULT 0,
            reminder_sent_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS discord_channels (
            channel_id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            parent_id TEXT,
            position INTEGER DEFAULT 0,
            topic TEXT,
            is_nsfw INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS discord_threads (
            thread_id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            parent_id TEXT NOT NULL,
            name TEXT NOT NULL,
            owner_id TEXT,
            archived INTEGER DEFAULT 0,
            locked INTEGER DEFAULT 0,
            message_count INTEGER DEFAULT 0,
            member_count INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS discord_users (
            user_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            global_name TEXT,
            discriminator TEXT,
            bot INTEGER DEFAULT 0,
            avatar_url TEXT,
            banner_url TEXT,
            created_at TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS discord_messages (
            message_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            thread_id TEXT,
            guild_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            author_username TEXT NOT NULL,
            content TEXT,
            pinned INTEGER DEFAULT 0,
            embeds_json TEXT,
            attachments_json TEXT,
            reactions_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS counter_state (
            channel_id TEXT PRIMARY KEY,
            current_number INTEGER DEFAULT 0,
            last_user_id TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS countdown_state (
            channel_id TEXT PRIMARY KEY,
            current_number INTEGER DEFAULT 900,
            is_trap_active INTEGER DEFAULT 0,
            trap_number INTEGER,
            last_user_id TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS countdown_scores (
            channel_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            PRIMARY KEY (channel_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS bot_version_state (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS discord_roles (
            role_id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            color INTEGER DEFAULT 0,
            hoist INTEGER DEFAULT 0,
            position INTEGER DEFAULT 0,
            permissions TEXT,
            managed INTEGER DEFAULT 0,
            mentionable INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS discord_events_archive (
            id SERIAL PRIMARY KEY,
            event_name TEXT NOT NULL,
            guild_id TEXT,
            target_id TEXT,
            user_id TEXT,
            username TEXT,
            summary TEXT,
            data_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_pg_events_name ON discord_events_archive(event_name);
        CREATE INDEX IF NOT EXISTS idx_pg_events_created ON discord_events_archive(created_at);
    `);
}

/**
 * Fonction principale exécutable programmatiquement ou en CLI
 */
async function migrateSqliteToPostgres(options = {}) {
    const isDryRun = options.dryRun ?? false;
    const specificTable = options.tableFilter || null;
    const sqlitePath = options.sqlitePath || process.env.DB_PATH || path.join(__dirname, '../data/bot.db');
    const pgConnectionString = options.pgConnectionString || process.env.DATABASE_URL || process.env.DB_URL;
    const silent = options.silent ?? false;

    const log = (...args) => { if (!silent) console.log(...args); };

    log('╔═══════════════════════════════════════════════════════════════════╗');
    log('║        🔄 MIGRATION DE DONNÉES : SQLite ➔ PostgreSQL             ║');
    log('╚═══════════════════════════════════════════════════════════════════╝');
    log(`📁 Source SQLite    : ${sqlitePath}`);
    log(`🐘 Cible PostgreSQL : ${pgConnectionString ? pgConnectionString.replace(/:[^:@]+@/, ':****@') : 'Variables PG_* individuelles'}`);
    log(`🧪 Mode Dry Run     : ${isDryRun ? 'OUI (Aucune écriture PG)' : 'NON (Écriture réelle)'}`);
    if (specificTable) {
        log(`🎯 Table unique     : ${specificTable}`);
    }
    log('───────────────────────────────────────────────────────────────────');

    if (!fs.existsSync(sqlitePath)) {
        throw new Error(`Fichier SQLite introuvable : ${sqlitePath}`);
    }

    let sqliteDb = new Database(sqlitePath, { readonly: true });
    let pgPool = null;
    let pgClient = null;

    if (!isDryRun) {
        const poolConfig = pgConnectionString ? { connectionString: pgConnectionString } : {
            host: process.env.PG_HOST || 'localhost',
            port: parseInt(process.env.PG_PORT || '5432', 10),
            user: process.env.PG_USER || 'postgres',
            password: process.env.PG_PASSWORD || '',
            database: process.env.PG_DATABASE || 'botdb'
        };

        pgPool = new Pool(poolConfig);
        pgClient = await pgPool.connect();
        log('🐘 Connexion établie avec le serveur PostgreSQL.');

        log('🛠️ Vérification et création des tables PostgreSQL cibles...');
        await ensurePgTables(pgClient);
        log('✅ Schéma PostgreSQL validé.');
    }

    const startTime = Date.now();
    let totalRowsMigrated = 0;
    const summary = [];
    const migratedTables = [];

    try {
        const targetTables = specificTable
            ? TABLES.filter(t => t.name === specificTable)
            : TABLES;

        if (targetTables.length === 0) {
            throw new Error(`Table inconnue ou introuvable : ${specificTable}`);
        }

        for (const tableDef of targetTables) {
            const tableName = tableDef.name;
            migratedTables.push(tableName);

            // Vérifier existence de la table dans SQLite
            const tableExists = sqliteDb.prepare(`
                SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name = ?
            `).get(tableName);

            if (!tableExists || tableExists.count === 0) {
                summary.push({ table: tableName, count: 0, status: 'Ignorée (Absente SQLite)' });
                continue;
            }

            // Lire les données SQLite
            const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
            const rowCount = rows.length;

            if (rowCount === 0) {
                summary.push({ table: tableName, count: 0, status: 'Vide (0 lignes)' });
                continue;
            }

            log(`📦 [${tableName}] ${rowCount} ligne(s) trouvée(s) dans SQLite.`);

            if (isDryRun) {
                totalRowsMigrated += rowCount;
                summary.push({ table: tableName, count: rowCount, status: 'Dry-Run OK' });
                continue;
            }

            // 3. Insérer les lignes dans PostgreSQL par lots
            const columns = Object.keys(rows[0]);
            const columnsList = columns.map(c => `"${c}"`).join(', ');

            // Construction de la clause de conflit
            let conflictClause = 'ON CONFLICT DO NOTHING';
            if (tableDef.conflictKeys && tableDef.conflictKeys.length > 0) {
                const conflictTarget = tableDef.conflictKeys.map(k => `"${k}"`).join(', ');
                const updateSets = columns
                    .filter(c => !tableDef.conflictKeys.includes(c) && c !== 'id' && c !== 'created_at')
                    .map(c => `"${c}" = EXCLUDED."${c}"`);

                if (updateSets.length > 0) {
                    conflictClause = `ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSets.join(', ')}`;
                }
            } else if (columns.includes('id')) {
                conflictClause = 'ON CONFLICT (id) DO NOTHING';
            }

            const BATCH_SIZE = 100;
            let migratedCount = 0;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);

                await pgClient.query('BEGIN');
                try {
                    for (const row of batch) {
                        const values = columns.map(col => {
                            let val = row[col];
                            if (val === undefined) return null;
                            return val;
                        });

                        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
                        const queryText = `
                            INSERT INTO "${tableName}" (${columnsList})
                            VALUES (${placeholders})
                            ${conflictClause};
                        `;
                        await pgClient.query(queryText, values);
                        migratedCount++;
                    }
                    await pgClient.query('COMMIT');
                } catch (err) {
                    await pgClient.query('ROLLBACK');
                    throw err;
                }
            }

            // Réajuster les séquences PostgreSQL (SERIAL PRIMARY KEY)
            if (columns.includes('id')) {
                try {
                    await pgClient.query(`
                        SELECT setval(
                            pg_get_serial_sequence('${tableName}', 'id'),
                            coalesce(max(id), 1)
                        ) FROM "${tableName}";
                    `);
                } catch (seqErr) {
                    // Ignore si pas de séquence
                }
            }

            log(`     ✅ [${tableName}] ${migratedCount} ligne(s) transférée(s) avec succès.`);
            totalRowsMigrated += migratedCount;
            summary.push({ table: tableName, count: migratedCount, status: 'Migré' });
        }

        const durationMs = Date.now() - startTime;
        const durationSec = (durationMs / 1000).toFixed(2);

        log('\n╔═══════════════════════════════════════════════════════════════════╗');
        log('║                   RÉSUMÉ DE LA MIGRATION                          ║');
        log('╚═══════════════════════════════════════════════════════════════════╝');
        if (!silent) console.table(summary);
        log(`\n🎉 Migration terminée en ${durationSec}s ! Total lignes : ${totalRowsMigrated}\n`);

        return {
            totalRows: totalRowsMigrated,
            migratedTables,
            summary,
            durationMs
        };

    } finally {
        if (sqliteDb) sqliteDb.close();
        if (pgClient) pgClient.release();
        if (pgPool) await pgPool.end();
    }
}

// Exécution si appelé directement depuis le terminal
if (require.main === module) {
    const args = process.argv.slice(2);
    function getArg(flag, defaultValue) {
        const idx = args.indexOf(flag);
        if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
            return args[idx + 1];
        }
        return defaultValue;
    }

    migrateSqliteToPostgres({
        dryRun: args.includes('--dry-run'),
        tableFilter: getArg('--table', null),
        sqlitePath: getArg('--sqlite', process.env.DB_PATH || path.join(__dirname, '../data/bot.db')),
        pgConnectionString: getArg('--pg', process.env.DATABASE_URL || process.env.DB_URL)
    }).catch(err => {
        console.error('\n❌ Échec critique de la migration :', err);
        process.exit(1);
    });
}

module.exports = {
    migrateSqliteToPostgres,
    TABLES,
    ensurePgTables
};
