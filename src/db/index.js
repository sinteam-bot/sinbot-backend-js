const path = require('path');
const fs = require('fs');
const { config } = require('../config/index.js');
const { sqliteSchema, pgSchema } = require('./schema/index.js');

let db = null;
let rawClient = null;
let activeSchema = null;
let dialect = 'sqlite'; // 'sqlite' | 'postgres'

/**
 * Initialise automatiquement la structure des tables pour SQLite
 */
function initSqliteTables(sqliteInstance) {
    sqliteInstance.exec(`
        CREATE TABLE IF NOT EXISTS user_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            event_type TEXT NOT NULL,
            event_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS form_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            form_name TEXT NOT NULL,
            responses TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_birthdays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            birthdate DATE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_xp (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            total_xp_earned INTEGER DEFAULT 0,
            messages_count INTEGER DEFAULT 0,
            voice_minutes INTEGER DEFAULT 0,
            events_participated INTEGER DEFAULT 0,
            last_message_xp DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS xp_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            xp_amount INTEGER NOT NULL,
            xp_type TEXT NOT NULL,
            description TEXT,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS voice_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            channel_name TEXT NOT NULL,
            join_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            leave_time DATETIME,
            duration_minutes INTEGER DEFAULT 0,
            xp_earned INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name TEXT NOT NULL,
            event_description TEXT,
            event_date DATETIME,
            xp_reward INTEGER DEFAULT 0,
            created_by TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS event_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            xp_earned INTEGER DEFAULT 0,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS server_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            discriminator TEXT,
            tag TEXT,
            display_name TEXT,
            avatar_url TEXT,
            joined_at DATETIME,
            account_created_at DATETIME,
            is_bot INTEGER DEFAULT 0,
            rejoin_count INTEGER DEFAULT 0,
            left_at DATETIME,
            roles TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS member_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS welcome_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT UNIQUE NOT NULL,
            welcome_channel_id TEXT,
            welcome_message TEXT,
            auto_roles TEXT,
            is_enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS openaimessages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            msgid TEXT UNIQUE NOT NULL,
            prompt TEXT,
            instruction TEXT,
            model TEXT,
            tokeninput INTEGER,
            tokenoutput INTEGER,
            content TEXT,
            previousmsgid TEXT,
            rawdata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS guild_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS grognement (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_captchas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            attempts INTEGER DEFAULT 0,
            is_verified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            verified_at DATETIME,
            expired_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, guild_id)
        );

        CREATE TABLE IF NOT EXISTS captcha_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT UNIQUE NOT NULL,
            channel_id TEXT,
            verified_role_id TEXT,
            timeout_minutes INTEGER DEFAULT 10,
            maxAttempts INTEGER DEFAULT 3,
            is_enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bump_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            user_id TEXT,
            username TEXT,
            bumped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            reminder_sent INTEGER DEFAULT 0,
            reminder_sent_at DATETIME
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
            created_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            created_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS discord_users (
            user_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            global_name TEXT,
            discriminator TEXT,
            bot INTEGER DEFAULT 0,
            avatar_url TEXT,
            banner_url TEXT,
            created_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            created_at DATETIME NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS counter_state (
            channel_id TEXT PRIMARY KEY,
            current_number INTEGER DEFAULT 0,
            last_user_id TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS countdown_state (
            channel_id TEXT PRIMARY KEY,
            current_number INTEGER DEFAULT 900,
            is_trap_active INTEGER DEFAULT 0,
            trap_number INTEGER,
            last_user_id TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            created_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS discord_events_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name TEXT NOT NULL,
            guild_id TEXT,
            target_id TEXT,
            user_id TEXT,
            username TEXT,
            summary TEXT,
            data_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_events_name ON discord_events_archive(event_name);
        CREATE INDEX IF NOT EXISTS idx_events_created ON discord_events_archive(created_at);
    `);
}

/**
 * Initialise automatiquement la structure des tables pour PostgreSQL
 */
async function initPgTables(pgPool) {
    await pgPool.query(`
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
            birthdate TEXT NOT NULL,
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
            last_message_xp TEXT,
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
            event_date TEXT,
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
            tokeninput INTEGER,
            tokenoutput INTEGER,
            content TEXT,
            previousmsgid TEXT,
            rawdata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS guild_members (
            id SERIAL PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS grognement (
            id SERIAL PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            expires_at TEXT,
            verified_at TEXT,
            expired_at TEXT,
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
 * Initialise le client Drizzle ORM (SQLite ou PostgreSQL)
 */
function initDatabase() {
    if (db) return { db, rawClient, schema: activeSchema, dialect };

    const dbType = (config.database_type || process.env.DATABASE_TYPE || '').toLowerCase();
    const dbUrl = config.database_url || process.env.DATABASE_URL || process.env.DB_URL;

    // Détection PostgreSQL
    if (dbType === 'postgres' || dbType === 'postgresql' || (dbUrl && dbUrl.startsWith('postgres'))) {
        dialect = 'postgres';
        activeSchema = pgSchema;

        const { drizzle } = require('drizzle-orm/node-postgres');
        const { Pool } = require('pg');

        const poolConfig = dbUrl ? { connectionString: dbUrl } : {
            host: process.env.PG_HOST || 'localhost',
            port: parseInt(process.env.PG_PORT || '5432', 10),
            user: process.env.PG_USER || 'postgres',
            password: process.env.PG_PASSWORD || '',
            database: process.env.PG_DATABASE || 'botdb'
        };

        rawClient = new Pool(poolConfig);
        db = drizzle(rawClient, { schema: pgSchema });

        // Initialisation des tables PostgreSQL
        initPgTables(rawClient)
            .then(() => console.log('✅ Base de données PostgreSQL initialisée avec succès avec Drizzle ORM'))
            .catch(err => console.error('❌ Erreur initialisation tables PostgreSQL:', err));

    } else {
        // Mode par défaut : SQLite
        dialect = 'sqlite';
        activeSchema = sqliteSchema;

        const { drizzle } = require('drizzle-orm/better-sqlite3');
        const Database = require('better-sqlite3');

        const dbDir = process.env.DB_DIR || path.join(__dirname, '../../data');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        const dbPath = config.db_path || process.env.DB_PATH || path.join(dbDir, 'bot.db');
        rawClient = new Database(dbPath);
        rawClient.pragma('journal_mode = WAL');

        initSqliteTables(rawClient);

        db = drizzle(rawClient, { schema: sqliteSchema });
        console.log(`✅ Base de données SQLite initialisée avec succès avec Drizzle ORM (${dbPath})`);
    }

    return {
        db,
        rawClient,
        schema: activeSchema,
        dialect,
        isPostgres: dialect === 'postgres',
        isSqlite: dialect === 'sqlite'
    };
}

// Initialisation immédiate
const dbContext = initDatabase();

module.exports = {
    ...dbContext,
    initDatabase
};
