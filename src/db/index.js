const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { config } = require('../config/index.js');
const pgSchema = require('./schema/pg.js');

let db = null;
let rawClient = null;
const dialect = 'postgres';

/**
 * Script DDL complet PostgreSQL
 */
const PG_TABLES_DDL = `
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
        display_color TEXT,
        highest_role_id TEXT,
        highest_role_name TEXT,
        highest_role_color TEXT,
        joined_at TEXT,
        account_created_at TEXT,
        is_bot INTEGER DEFAULT 0,
        rejoin_count INTEGER DEFAULT 0,
        left_at TEXT,
        roles TEXT,
        presence TEXT DEFAULT 'offline',
        deleted_at TIMESTAMP,
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
        deleted_at TIMESTAMP,
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
        deleted_at TIMESTAMP,
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
        deleted_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS counter_state (
        channel_id TEXT PRIMARY KEY,
        current_number INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_user_id TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS countdown_state (
        channel_id TEXT PRIMARY KEY,
        current_number INTEGER DEFAULT 900,
        error_count INTEGER DEFAULT 0,
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
        color_hex TEXT,
        icon_url TEXT,
        unicode_emoji TEXT,
        member_count INTEGER DEFAULT 0,
        hoist INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0,
        permissions TEXT,
        managed INTEGER DEFAULT 0,
        mentionable INTEGER DEFAULT 0,
        created_at TEXT,
        deleted_at TIMESTAMP,
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

    CREATE TABLE IF NOT EXISTS discord_emojis (
        emoji_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        animated INTEGER DEFAULT 0,
        url TEXT,
        roles_json TEXT,
        created_at TEXT,
        deleted_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Phase 0: Multi-guild foundations
    CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        locale TEXT DEFAULT 'fr',
        timezone TEXT DEFAULT 'Europe/Paris',
        owner_id TEXT,
        premium_tier INTEGER DEFAULT 0,
        joined_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
        guild_id TEXT NOT NULL,
        feature_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config_json TEXT NOT NULL DEFAULT '{}',
        allowed_roles TEXT NOT NULL DEFAULT '[]',
        updated_by TEXT,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (guild_id, feature_name)
    );

    CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);

    -- Phase 1: AutoMod tables
    CREATE TABLE IF NOT EXISTS user_warnings (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        mod_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        rule TEXT,
        created_at BIGINT NOT NULL,
        expires_at BIGINT,
        active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_user_warnings_guild_user ON user_warnings(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_user_warnings_active ON user_warnings(active);

    CREATE TABLE IF NOT EXISTS user_sanctions (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        reason TEXT NOT NULL,
        mod_id TEXT NOT NULL,
        duration_ms BIGINT,
        starts_at BIGINT NOT NULL,
        expires_at BIGINT,
        revoked_by TEXT,
        revoked_at BIGINT,
        revoked_reason TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_sanctions_guild_user ON user_sanctions(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sanctions_active ON user_sanctions(active);

    CREATE TABLE IF NOT EXISTS mod_logs (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        mod_id TEXT,
        action TEXT NOT NULL,
        channel_id TEXT,
        message_id TEXT,
        reason TEXT,
        metadata TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mod_logs_guild_created ON mod_logs(guild_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_mod_logs_guild_user ON mod_logs(guild_id, user_id);

    -- Phase 3: Tickets
    CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'support',
        subject TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        claimed_by TEXT,
        closed_by TEXT,
        closed_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);

    CREATE TABLE IF NOT EXISTS ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        content TEXT,
        attachments TEXT,
        is_staff INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

    -- Phase 4: Generic event log
    CREATE TABLE IF NOT EXISTS event_log (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        actor_id TEXT,
        target_id TEXT,
        channel_id TEXT,
        metadata TEXT,
        summary TEXT,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_event_log_guild_type ON event_log(guild_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_event_log_guild_created ON event_log(guild_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_log_actor ON event_log(actor_id);
    CREATE INDEX IF NOT EXISTS idx_event_log_target ON event_log(target_id);

    -- Phase 6: Welcome card cache
    CREATE TABLE IF NOT EXISTS welcome_cards (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        template TEXT NOT NULL,
        payload TEXT NOT NULL,
        svg TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_welcome_cards_user ON welcome_cards(guild_id, user_id, template);

    -- Phase 5: Giveaways
    CREATE TABLE IF NOT EXISTS giveaways (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        host_id TEXT NOT NULL,
        prize TEXT NOT NULL,
        description TEXT,
        winners_count INTEGER NOT NULL DEFAULT 1,
        required_role_id TEXT,
        starts_at BIGINT NOT NULL,
        ends_at BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        winners_json TEXT,
        color TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_giveaways_guild_status ON giveaways(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_giveaways_ends_at ON giveaways(ends_at);
    CREATE INDEX IF NOT EXISTS idx_giveaways_channel ON giveaways(channel_id);

    CREATE TABLE IF NOT EXISTS giveaway_entries (
        giveaway_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        entered_at BIGINT NOT NULL,
        PRIMARY KEY (giveaway_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_giveaway_entries_user ON giveaway_entries(user_id);

    -- Phase 5: Polls
    CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        question TEXT NOT NULL,
        options_json TEXT NOT NULL,
        multi_choice INTEGER NOT NULL DEFAULT 0,
        anonymous INTEGER NOT NULL DEFAULT 0,
        ends_at BIGINT,
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT NOT NULL,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_polls_guild_status ON polls(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_polls_message ON polls(message_id);

    CREATE TABLE IF NOT EXISTS poll_votes (
        poll_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        option_index INTEGER NOT NULL,
        voted_at BIGINT NOT NULL,
        PRIMARY KEY (poll_id, user_id, option_index)
    );
    CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

    -- Phase 7: Birthdays
    CREATE TABLE IF NOT EXISTS birthday_guild_settings (
        guild_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'public',
        announce_channel_id TEXT,
        announce_hour INTEGER NOT NULL DEFAULT 9,
        announce_timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
        ping_role_id TEXT,
        message_template TEXT NOT NULL DEFAULT '🎂 Joyeux anniversaire {user} ! Tu fêtes tes **{age} ans** aujourdhui !',
        temp_role_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS birthday_visibility (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, guild_id)
    );
    CREATE INDEX IF NOT EXISTS idx_birthday_visibility_user ON birthday_visibility(user_id);

    CREATE TABLE IF NOT EXISTS birthday_change_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        change_number INTEGER NOT NULL,
        previous_birthdate TEXT,
        new_birthdate TEXT NOT NULL,
        cooldown_until BIGINT NOT NULL,
        changed_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_birthday_change_user ON birthday_change_log(user_id, guild_id);
    CREATE INDEX IF NOT EXISTS idx_birthday_change_until ON birthday_change_log(cooldown_until);

    CREATE TABLE IF NOT EXISTS birthday_history (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        age INTEGER,
        message_id TEXT,
        gifts_given TEXT,
        announced_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_birthday_history_user ON birthday_history(user_id, guild_id, announced_at);
    CREATE INDEX IF NOT EXISTS idx_birthday_history_guild ON birthday_history(guild_id, announced_at);
`;

/**
 * Initialise automatiquement la structure des tables pour PostgreSQL
 */
async function initPgTables(client) {
    await client.query(PG_TABLES_DDL);

    // Migration progressive automatique des colonnes manquantes pour PostgreSQL
    const migrationStatements = [
        `ALTER TABLE counter_state ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;`,
        `ALTER TABLE countdown_state ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;`,
        `ALTER TABLE discord_roles ADD COLUMN IF NOT EXISTS color_hex TEXT;`,
        `ALTER TABLE discord_roles ADD COLUMN IF NOT EXISTS icon_url TEXT;`,
        `ALTER TABLE discord_roles ADD COLUMN IF NOT EXISTS unicode_emoji TEXT;`,
        `ALTER TABLE discord_roles ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0;`,
        `ALTER TABLE discord_roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`,
        `ALTER TABLE server_members ADD COLUMN IF NOT EXISTS display_color TEXT;`,
        `ALTER TABLE server_members ADD COLUMN IF NOT EXISTS highest_role_id TEXT;`,
        `ALTER TABLE server_members ADD COLUMN IF NOT EXISTS highest_role_name TEXT;`,
        `ALTER TABLE server_members ADD COLUMN IF NOT EXISTS highest_role_color TEXT;`,
        `ALTER TABLE server_members ADD COLUMN IF NOT EXISTS presence TEXT DEFAULT 'offline';`,
        `ALTER TABLE server_members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`,
        `ALTER TABLE discord_channels ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`,
        `ALTER TABLE discord_threads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`,
        `ALTER TABLE discord_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`,
        `ALTER TABLE discord_emojis ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`,
        `ALTER TABLE feature_flags ALTER COLUMN updated_at TYPE BIGINT;`,
        `ALTER TABLE user_warnings ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE user_warnings ALTER COLUMN expires_at TYPE BIGINT;`,
        `ALTER TABLE user_sanctions ALTER COLUMN duration_ms TYPE BIGINT;`,
        `ALTER TABLE user_sanctions ALTER COLUMN starts_at TYPE BIGINT;`,
        `ALTER TABLE user_sanctions ALTER COLUMN expires_at TYPE BIGINT;`,
        `ALTER TABLE user_sanctions ALTER COLUMN revoked_at TYPE BIGINT;`,
        `ALTER TABLE user_sanctions ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE mod_logs ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE tickets ALTER COLUMN closed_at TYPE BIGINT;`,
        `ALTER TABLE tickets ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE tickets ALTER COLUMN updated_at TYPE BIGINT;`,
        `ALTER TABLE ticket_messages ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE event_log ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE welcome_cards ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE welcome_cards ALTER COLUMN expires_at TYPE BIGINT;`,
        `ALTER TABLE giveaways ALTER COLUMN starts_at TYPE BIGINT;`,
        `ALTER TABLE giveaways ALTER COLUMN ends_at TYPE BIGINT;`,
        `ALTER TABLE giveaways ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE giveaways ALTER COLUMN updated_at TYPE BIGINT;`,
        `ALTER TABLE giveaway_entries ALTER COLUMN entered_at TYPE BIGINT;`,
        `ALTER TABLE polls ALTER COLUMN ends_at TYPE BIGINT;`,
        `ALTER TABLE polls ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE poll_votes ALTER COLUMN voted_at TYPE BIGINT;`,
        `ALTER TABLE birthday_guild_settings ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE birthday_guild_settings ALTER COLUMN updated_at TYPE BIGINT;`,
        `ALTER TABLE birthday_visibility ALTER COLUMN updated_at TYPE BIGINT;`,
        `ALTER TABLE birthday_change_log ALTER COLUMN cooldown_until TYPE BIGINT;`,
        `ALTER TABLE birthday_change_log ALTER COLUMN changed_at TYPE BIGINT;`,
        `ALTER TABLE birthday_history ALTER COLUMN announced_at TYPE BIGINT;`,
        `ALTER TABLE server_members ALTER COLUMN joined_at TYPE BIGINT;`,
        `ALTER TABLE server_members ALTER COLUMN created_at TYPE BIGINT;`,
        `ALTER TABLE server_members ALTER COLUMN updated_at TYPE BIGINT;`
    ];

    for (const stmt of migrationStatements) {
        try {
            await client.query(stmt);
        } catch (e) {
            // Ignorer si déjà existant ou non supporté
        }
    }
}

/**
 * Crée un adaptateur PostgreSQL en mémoire pour les tests et le développement local
 */
function createMockPgPool() {
    const Database = require('better-sqlite3');
    const memDb = new Database(':memory:');
    memDb.pragma('journal_mode = WAL');

    function convertPgSql(sqlInput) {
        if (!sqlInput) return '';
        let sqlText = typeof sqlInput === 'string' ? sqlInput : (sqlInput.text || '');

        // 1. Replace default keyword in VALUES (...)
        sqlText = sqlText.replace(/values\s*\(([^)]+)\)/gi, (match, inner) => {
            const cleanedInner = inner.replace(/\bdefault\b/gi, 'NULL');
            return `VALUES (${cleanedInner})`;
        });

        // 2. Convert PG specific types and keywords
        sqlText = sqlText
            .replace(/\bSERIAL\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
            .replace(/::[a-zA-Z]+/g, '')
            .replace(/\$\d+/g, '?');

        return sqlText;
    }

    // Initialiser les tables immédiatement et de manière synchrone
    const syncSql = convertPgSql(PG_TABLES_DDL);
    memDb.exec(syncSql);

    function executeQuery(queryInput, params = []) {
        const rawSql = typeof queryInput === 'string' ? queryInput : queryInput.text;
        const values = typeof queryInput === 'object' && queryInput.values ? queryInput.values : params;
        const isArrayMode = typeof queryInput === 'object' && queryInput.rowMode === 'array';
        const cleanSql = convertPgSql(rawSql);
        const trimmed = cleanSql.trim().toUpperCase();

        if (trimmed.startsWith('SELECT') || trimmed.includes('RETURNING')) {
            const stmt = memDb.prepare(cleanSql);
            const rows = isArrayMode ? stmt.raw().all(...values) : stmt.all(...values);
            const cols = stmt.columns();
            const fields = cols.map(c => ({ name: c.name, dataTypeID: 0 }));
            return { rows, rowCount: rows.length, fields };
        } else {
            const stmt = memDb.prepare(cleanSql);
            const info = stmt.run(...values);
            const rows = isArrayMode ? [[Number(info.lastInsertRowid)]] : [{ id: Number(info.lastInsertRowid) }];
            return { rows, rowCount: info.changes, fields: [{ name: 'id', dataTypeID: 0 }] };
        }
    }

    const adapter = {
        query: async (queryInput, params = []) => {
            return executeQuery(queryInput, params);
        },
        connect: async () => {
            return {
                query: async (queryInput, params = []) => {
                    const rawSql = typeof queryInput === 'string' ? queryInput : queryInput.text;
                    const trimmed = (rawSql || '').trim().toUpperCase();
                    if (trimmed === 'BEGIN') {
                        memDb.exec('BEGIN');
                        return { rows: [], fields: [] };
                    } else if (trimmed === 'COMMIT') {
                        memDb.exec('COMMIT');
                        return { rows: [], fields: [] };
                    } else if (trimmed === 'ROLLBACK') {
                        memDb.exec('ROLLBACK');
                        return { rows: [], fields: [] };
                    }
                    return executeQuery(queryInput, params);
                },
                release: () => {}
            };
        },
        end: async () => {
            memDb.close();
        }
    };

    return adapter;
}

/**
 * Initialise le client Drizzle ORM PostgreSQL
 */
function initDatabase() {
    if (db) return { db, rawClient, schema: pgSchema, dialect, isPostgres: true, isSqlite: false };

    const dbUrl = config.database_url || process.env.DATABASE_URL || process.env.DB_URL;
    const isTest = process.env.NODE_ENV === 'test' || !dbUrl;

    if (isTest && !dbUrl && !process.env.PG_HOST) {
        // En mode test / dev local sans serveur PostgreSQL externe, utiliser l'adaptateur PG en mémoire
        rawClient = createMockPgPool();
        db = drizzle(rawClient, { schema: pgSchema });
    } else {
        // Mode PostgreSQL Réel (Production / Staging)
        const poolConfig = dbUrl ? { connectionString: dbUrl } : {
            host: process.env.PG_HOST || 'localhost',
            port: parseInt(process.env.PG_PORT || '5432', 10),
            user: process.env.PG_USER || 'postgres',
            password: process.env.PG_PASSWORD || '',
            database: process.env.PG_DATABASE || 'botdb'
        };

        rawClient = new Pool(poolConfig);
        db = drizzle(rawClient, { schema: pgSchema });

        initPgTables(rawClient)
            .then(() => console.log('✅ Base de données PostgreSQL de Production initialisée avec succès avec Drizzle ORM'))
            .catch(err => console.warn(`ℹ️ [PostgreSQL] Initialisation tables différée (${err.message})`));
    }

    if (db) {
        db.pool = rawClient;
    }

    return {
        db,
        rawClient,
        pool: rawClient,
        schema: pgSchema,
        dialect: 'postgres',
        isPostgres: true,
        isSqlite: false
    };
}

// Initialisation immédiate
const dbContext = initDatabase();

module.exports = {
    ...dbContext,
    initDatabase,
    initPgTables
};
