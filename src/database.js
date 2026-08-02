const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Configuration du captcha
const CAPTCHA_CONFIG = require('./config/captcha-config');

// Repertoire et chemin de la base de donnees SQLite
const dbDir = process.env.DB_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'bot.db');
const db = new Database(dbPath);

// Activer le mode WAL pour de meilleures performances
db.pragma('journal_mode = WAL');

// Initialisation automatique des tables SQLite au démarrage
function initDb() {
    db.exec(`
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
            max_attempts INTEGER DEFAULT 3,
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
            current_number INTEGER DEFAULT 90,
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
    `);
    console.log('✅ Base de donnees SQLite initialisee avec succes (' + dbPath + ')');
}

initDb();

function adaptQuery(sql) {
    let cleanSql = sql;
    cleanSql = cleanSql.replace(/::[a-zA-Z]+/g, '');
    cleanSql = cleanSql.replace(/\$\d+/g, '?');
    return cleanSql;
}

function queryDb(sql, params = []) {
    const cleanSql = adaptQuery(sql);
    const trimmed = cleanSql.trim().toUpperCase();

    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
        const stmt = db.prepare(cleanSql);
        const rows = stmt.all(...params);
        return { rows };
    } else {
        const stmt = db.prepare(cleanSql);
        if (cleanSql.toUpperCase().includes('RETURNING')) {
            const rows = stmt.all(...params);
            return { rows };
        } else {
            const info = stmt.run(...params);
            return { rows: [{ id: info.lastInsertRowid }], changes: info.changes };
        }
    }
}

const pool = {
    query: async (sql, params = []) => {
        return queryDb(sql, params);
    },
    connect: async () => {
        let inTx = false;
        return {
            query: async (sql, params = []) => {
                const trimmed = sql.trim().toUpperCase();
                if (trimmed === 'BEGIN') {
                    db.exec('BEGIN TRANSACTION');
                    inTx = true;
                    return { rows: [] };
                } else if (trimmed === 'COMMIT') {
                    if (inTx) db.exec('COMMIT');
                    inTx = false;
                    return { rows: [] };
                } else if (trimmed === 'ROLLBACK') {
                    if (inTx) db.exec('ROLLBACK');
                    inTx = false;
                    return { rows: [] };
                } else {
                    return queryDb(sql, params);
                }
            },
            release: () => { }
        };
    }
};

/**
 * Enregistrer un événement utilisateur
 */
async function logUserEvent(userId, username, eventType, eventData = {}) {
    const query = `
        INSERT INTO user_events (user_id, username, event_type, event_data)
        VALUES (?, ?, ?, ?)
        RETURNING id, created_at
    `;
    try {
        const result = await pool.query(query, [
            userId,
            username,
            eventType,
            JSON.stringify(eventData)
        ]);
        console.log(`📝 Événement enregistré: ${eventType} pour ${username}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement:', error);
        throw error;
    }
}

/**
 * Récupérer les événements d'un utilisateur
 */
async function getUserEvents(userId, limit = 10) {
    const query = `
        SELECT * FROM user_events
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    `;
    try {
        const result = await pool.query(query, [userId, limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur lors de la récupération:', error);
        throw error;
    }
}

/**
 * Enregistrer une réponse de formulaire
 */
async function saveFormResponse(userId, username, formName, responses) {
    const query = `
        INSERT INTO form_responses (user_id, username, form_name, responses)
        VALUES (?, ?, ?, ?)
        RETURNING id
    `;
    try {
        const result = await pool.query(query, [
            userId,
            username,
            formName,
            JSON.stringify(responses)
        ]);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde du formulaire:', error);
        throw error;
    }
}

/**
 * Récupérer les statistiques globales
 */
async function getGlobalStats() {
    const query = `
        SELECT 
            COUNT(DISTINCT user_id) as total_users,
            COUNT(*) as total_events,
            event_type,
            COUNT(*) as count
        FROM user_events
        GROUP BY event_type
        ORDER BY count DESC
    `;
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des stats:', error);
        throw error;
    }
}

/**
 * Enregistrer ou mettre à jour la date de naissance d'un utilisateur
 */
async function setBirthday(userId, username, birthdate) {
    const query = `
        INSERT INTO user_birthdays (user_id, username, birthdate)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) 
        DO UPDATE SET 
            username = excluded.username,
            birthdate = excluded.birthdate,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, birthdate
    `;
    try {
        const result = await pool.query(query, [userId, username, birthdate]);
        console.log(`🎂 Date de naissance enregistrée pour ${username}`);
        return { ...result.rows[0], action: 'saved' };
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement de la date de naissance:', error);
        throw error;
    }
}

/**
 * Récupérer la date de naissance d'un utilisateur
 */
async function getBirthday(userId) {
    const query = `
        SELECT 
            user_id,
            username,
            birthdate,
            CAST((strftime('%Y', 'now') - strftime('%Y', birthdate)) AS INTEGER) as age,
            strftime('%d/%m/%Y', birthdate) as formatted_date,
            created_at,
            updated_at
        FROM user_birthdays
        WHERE user_id = ?
    `;
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur lors de la récupération de la date de naissance:', error);
        throw error;
    }
}

/**
 * Supprimer la date de naissance d'un utilisateur
 */
async function deleteBirthday(userId) {
    const query = `
        DELETE FROM user_birthdays
        WHERE user_id = ?
        RETURNING username
    `;
    try {
        const result = await pool.query(query, [userId]);
        if (result.rows.length > 0) {
            console.log(`🗑️  Date de naissance supprimée pour ${result.rows[0].username}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Erreur lors de la suppression:', error);
        throw error;
    }
}

/**
 * Récupérer tous les anniversaires du jour
 */
async function getTodayBirthdays() {
    const query = `
        SELECT 
            user_id,
            username,
            birthdate,
            CAST((strftime('%Y', 'now') - strftime('%Y', birthdate)) AS INTEGER) as age
        FROM user_birthdays
        WHERE 
            strftime('%m', birthdate) = strftime('%m', 'now')
            AND strftime('%d', birthdate) = strftime('%d', 'now')
    `;
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des anniversaires du jour:', error);
        throw error;
    }
}

/**
 * Récupérer les prochains anniversaires (dans les N jours)
 */
async function getUpcomingBirthdays(days = 7) {
    try {
        const result = await pool.query(`
            SELECT 
                user_id,
                username,
                birthdate,
                strftime('%d/%m', birthdate) as birthday_date
            FROM user_birthdays
        `);

        const now = new Date();
        const upcoming = result.rows.map(b => {
            const bdate = new Date(b.birthdate);
            let nextBirthday = new Date(now.getFullYear(), bdate.getMonth(), bdate.getDate());
            if (nextBirthday < now) {
                nextBirthday.setFullYear(now.getFullYear() + 1);
            }
            const diffTime = nextBirthday - now;
            const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            let age = now.getFullYear() - bdate.getFullYear();
            return {
                ...b,
                current_age: age,
                days_until: daysUntil
            };
        })
            .filter(b => b.days_until <= days)
            .sort((a, b) => a.days_until - b.days_until);

        return upcoming;
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des anniversaires à venir:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS XP & LEVELS
// ============================================

const XP_CONFIG = require('./config/xp-config');

function calculateXPForLevel(level) {
    return Math.floor(XP_CONFIG.LEVEL.BASE_XP * Math.pow(level, XP_CONFIG.LEVEL.MULTIPLIER));
}

function calculateLevel(totalXP) {
    let level = 1;
    let xpRequired = calculateXPForLevel(level);
    while (totalXP >= xpRequired) {
        level++;
        xpRequired = calculateXPForLevel(level);
    }
    return level - 1;
}

async function getOrCreateUserXP(userId, username) {
    const selectQuery = 'SELECT * FROM user_xp WHERE user_id = ?';
    const insertQuery = `
        INSERT INTO user_xp (user_id, username, xp, level)
        VALUES (?, ?, 0, 1)
        RETURNING *
    `;
    try {
        let result = await pool.query(selectQuery, [userId]);
        if (result.rows.length === 0) {
            result = await pool.query(insertQuery, [userId, username]);
            console.log(`✨ Nouvel utilisateur XP créé: ${username}`);
        }
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur getOrCreateUserXP:', error);
        throw error;
    }
}

async function addXP(userId, username, xpAmount, xpType = 'message', description = null, metadata = {}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let user = await getOrCreateUserXP(userId, username);
        const xpToAdd = parseInt(xpAmount, 10);
        const currentXP = parseInt(user.xp, 10) || 0;
        const newTotalXP = currentXP + xpToAdd;
        const oldLevel = user.level;
        const newLevel = calculateLevel(newTotalXP);

        const updateQuery = `
            UPDATE user_xp 
            SET xp = ?, 
                level = ?, 
                total_xp_earned = total_xp_earned + ?,
                username = ?,
                messages_count = CASE WHEN ? = 'message' THEN messages_count + 1 ELSE messages_count END,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            RETURNING *
        `;

        const updateResult = await client.query(updateQuery, [
            newTotalXP,
            newLevel,
            xpToAdd,
            username,
            xpType,
            userId
        ]);

        const transactionQuery = `
            INSERT INTO xp_transactions (user_id, username, xp_amount, xp_type, description, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        await client.query(transactionQuery, [
            userId,
            username,
            xpToAdd,
            xpType,
            description,
            JSON.stringify(metadata)
        ]);

        await client.query('COMMIT');

        console.log(`⭐ +${xpToAdd} XP pour ${username} (${xpType}) - Total: ${newTotalXP} XP`);

        return {
            user: updateResult.rows[0],
            leveledUp: newLevel > oldLevel,
            oldLevel: oldLevel,
            newLevel: newLevel,
            xpGained: xpToAdd
        };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur addXP:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function addMessageXP(userId, username) {
    try {
        const user = await getOrCreateUserXP(userId, username);

        if (user.last_message_xp) {
            const lastXP = new Date(user.last_message_xp);
            const now = new Date();
            const secondsSinceLastXP = (now - lastXP) / 1000;

            if (secondsSinceLastXP < XP_CONFIG.MESSAGE_XP.COOLDOWN) {
                return { success: false, reason: 'cooldown' };
            }
        }

        const xpAmount = Math.floor(
            Math.random() * (XP_CONFIG.MESSAGE_XP.MAX - XP_CONFIG.MESSAGE_XP.MIN + 1)
        ) + XP_CONFIG.MESSAGE_XP.MIN;

        await pool.query(
            'UPDATE user_xp SET last_message_xp = CURRENT_TIMESTAMP WHERE user_id = ?',
            [userId]
        );

        const result = await addXP(userId, username, xpAmount, 'message', 'Message XP');
        return { success: true, ...result };

    } catch (error) {
        console.error('❌ Erreur addMessageXP:', error);
        return { success: false, reason: 'error' };
    }
}

async function startVoiceSession(userId, username, channelId, channelName) {
    const query = `
        INSERT INTO voice_sessions (user_id, username, channel_id, channel_name, join_time)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        RETURNING id
    `;
    try {
        const result = await pool.query(query, [userId, username, channelId, channelName]);
        console.log(`🎤 ${username} a rejoint le vocal ${channelName}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur startVoiceSession:', error);
        throw error;
    }
}

async function endVoiceSession(userId, username) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const findQuery = `
            SELECT * FROM voice_sessions 
            WHERE user_id = ? AND leave_time IS NULL
            ORDER BY join_time DESC
            LIMIT 1
        `;

        const session = await client.query(findQuery, [userId]);
        if (session.rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        const sessionData = session.rows[0];
        const joinTime = new Date(sessionData.join_time);
        const leaveTime = new Date();
        const durationMinutes = Math.floor((leaveTime - joinTime) / (1000 * 60));
        const xpEarned = durationMinutes * XP_CONFIG.VOICE_XP.PER_MINUTE;

        const updateQuery = `
            UPDATE voice_sessions 
            SET leave_time = CURRENT_TIMESTAMP,
                duration_minutes = ?,
                xp_earned = ?
            WHERE id = ?
        `;

        await client.query(updateQuery, [durationMinutes, xpEarned, sessionData.id]);

        if (durationMinutes >= XP_CONFIG.VOICE_XP.MIN_DURATION && xpEarned > 0) {
            await addXP(
                userId,
                username,
                xpEarned,
                'voice',
                `${durationMinutes} minutes en vocal`,
                { channel: sessionData.channel_name, duration: durationMinutes }
            );

            await client.query(
                'UPDATE user_xp SET voice_minutes = voice_minutes + ? WHERE user_id = ?',
                [durationMinutes, userId]
            );
        }

        await client.query('COMMIT');

        console.log(`🎤 ${username} a quitté le vocal - ${durationMinutes}min = ${xpEarned} XP`);

        return {
            duration: durationMinutes,
            xpEarned: xpEarned,
            channel: sessionData.channel_name
        };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur endVoiceSession:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function getUserXPInfo(userId) {
    try {
        const user = await getOrCreateUserXP(userId, 'Unknown');
        const currentLevel = user.level;
        const currentXP = user.xp;
        const xpForCurrentLevel = calculateXPForLevel(currentLevel);
        const xpForNextLevel = calculateXPForLevel(currentLevel + 1);
        const xpNeeded = xpForNextLevel - currentXP;
        const xpProgress = currentXP - xpForCurrentLevel;
        const xpToNextLevel = xpForNextLevel - xpForCurrentLevel;
        const progressPercentage = Math.floor((xpProgress / xpToNextLevel) * 100);

        return {
            ...user,
            xpForCurrentLevel,
            xpForNextLevel,
            xpNeeded,
            xpProgress,
            xpToNextLevel,
            progressPercentage
        };
    } catch (error) {
        console.error('❌ Erreur getUserXPInfo:', error);
        throw error;
    }
}

async function getLeaderboard(limit = 10) {
    const query = `
        SELECT 
            user_id,
            username,
            xp,
            level,
            messages_count,
            voice_minutes,
            total_xp_earned,
            ROW_NUMBER() OVER (ORDER BY xp DESC) as rank
        FROM user_xp
        ORDER BY xp DESC
        LIMIT ?
    `;
    try {
        const result = await pool.query(query, [limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur getLeaderboard:', error);
        throw error;
    }
}

async function getUserRank(userId) {
    const query = `
        WITH ranked_users AS (
            SELECT 
                user_id,
                ROW_NUMBER() OVER (ORDER BY xp DESC) as rank
            FROM user_xp
        )
        SELECT rank FROM ranked_users WHERE user_id = ?
    `;
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0]?.rank || null;
    } catch (error) {
        console.error('❌ Erreur getUserRank:', error);
        throw error;
    }
}

async function createEvent(eventName, eventDescription, eventDate, xpReward, createdBy) {
    const query = `
        INSERT INTO events (event_name, event_description, event_date, xp_reward, created_by)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [eventName, eventDescription, eventDate, xpReward, createdBy]);
        console.log(`🎉 Événement créé: ${eventName}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur createEvent:', error);
        throw error;
    }
}

async function addEventParticipant(eventId, userId, username) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const eventQuery = 'SELECT * FROM events WHERE id = ? AND is_active = 1';
        const event = await client.query(eventQuery, [eventId]);

        if (event.rows.length === 0) {
            throw new Error('Événement introuvable ou inactif');
        }

        const eventData = event.rows[0];

        const participantQuery = `
            INSERT INTO event_participants (event_id, user_id, username, xp_earned)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(event_id, user_id) DO NOTHING
            RETURNING *
        `;

        const participant = await client.query(participantQuery, [
            eventId,
            userId,
            username,
            eventData.xp_reward
        ]);

        if (participant.rows.length > 0) {
            await addXP(
                userId,
                username,
                eventData.xp_reward,
                'event',
                `Participation à: ${eventData.event_name}`,
                { event_id: eventId, event_name: eventData.event_name }
            );

            await client.query(
                'UPDATE user_xp SET events_participated = events_participated + 1 WHERE user_id = ?',
                [userId]
            );
        }

        await client.query('COMMIT');
        return {
            success: participant.rows.length > 0,
            xpEarned: eventData.xp_reward,
            eventName: eventData.event_name
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur addEventParticipant:', error);
        throw error;
    } finally {
        client.release();
    }
}

// ============================================
// FONCTIONS GESTION DES MEMBRES
// ============================================

async function registerNewMember(member) {
    const query = `
        INSERT INTO server_members (
            user_id, username, discriminator, tag, display_name, avatar_url, joined_at, account_created_at, is_bot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) 
        DO UPDATE SET
            username = excluded.username,
            discriminator = excluded.discriminator,
            tag = excluded.tag,
            display_name = excluded.display_name,
            avatar_url = excluded.avatar_url,
            rejoin_count = server_members.rejoin_count + 1,
            joined_at = excluded.joined_at,
            left_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [
            member.id,
            member.user.username,
            member.user.discriminator || '0',
            member.user.tag,
            member.displayName || member.user.username,
            member.user.displayAvatarURL({ size: 512 }),
            member.joinedAt,
            member.user.createdAt,
            member.user.bot ? 1 : 0
        ]);
        console.log(`👤 Membre enregistré: ${member.user.tag}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur registerNewMember:', error);
        throw error;
    }
}

async function logMemberEvent(userId, username, action, guildId, metadata = {}) {
    const query = `
        INSERT INTO member_history (user_id, username, action, guild_id, metadata)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [
            userId,
            username,
            action,
            guildId,
            JSON.stringify(metadata)
        ]);
        console.log(`📝 Événement membre: ${username} - ${action}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur logMemberEvent:', error);
        throw error;
    }
}

async function updateMemberRoles(userId, roles) {
    const rolesArray = roles.map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor
    }));
    const query = `
        UPDATE server_members 
        SET roles = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [
            JSON.stringify(rolesArray),
            userId
        ]);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur updateMemberRoles:', error);
        throw error;
    }
}

async function markMemberLeft(userId) {
    const query = `
        UPDATE server_members 
        SET left_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur markMemberLeft:', error);
        throw error;
    }
}

async function getMemberInfo(userId) {
    const query = `SELECT * FROM server_members WHERE user_id = ?`;
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getMemberInfo:', error);
        throw error;
    }
}

async function getRecentMembers(limit = 10) {
    const query = `
        SELECT * FROM server_members 
        WHERE left_at IS NULL
        ORDER BY joined_at DESC 
        LIMIT ?
    `;
    try {
        const result = await pool.query(query, [limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur getRecentMembers:', error);
        throw error;
    }
}

async function getMemberHistory(userId, limit = 20) {
    const query = `
        SELECT * FROM member_history 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
    `;
    try {
        const result = await pool.query(query, [userId, limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur getMemberHistory:', error);
        throw error;
    }
}

async function getWelcomeConfig(guildId) {
    const query = `SELECT * FROM welcome_config WHERE guild_id = ?`;
    try {
        const result = await pool.query(query, [guildId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getWelcomeConfig:', error);
        throw error;
    }
}

async function saveWelcomeConfig(guildId, config) {
    const query = `
        INSERT INTO welcome_config (guild_id, welcome_channel_id, welcome_message, auto_roles, is_enabled)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) 
        DO UPDATE SET
            welcome_channel_id = excluded.welcome_channel_id,
            welcome_message = excluded.welcome_message,
            auto_roles = excluded.auto_roles,
            is_enabled = excluded.is_enabled,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [
            guildId,
            config.channelId,
            config.message,
            JSON.stringify(config.autoRoles),
            config.enabled ? 1 : 0
        ]);
        console.log(`⚙️ Configuration d'accueil mise à jour pour le serveur ${guildId}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur saveWelcomeConfig:', error);
        throw error;
    }
}

async function saveOpenAIMessage(config) {
    const query = `
        INSERT INTO openaimessages (
            msgid, prompt, instruction, model, tokeninput, tokenoutput, content, previousmsgid, created_at, rawdata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(msgid) 
        DO UPDATE SET
            prompt = excluded.prompt,
            instruction = excluded.instruction,
            model = excluded.model,
            tokeninput = excluded.tokeninput,
            tokenoutput = excluded.tokenoutput,
            content = excluded.content,
            previousmsgid = excluded.previousmsgid,
            updated_at = CURRENT_TIMESTAMP,
            rawdata = excluded.rawdata
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [
            config.msgid,
            config.prompt,
            config.instruction,
            config.model,
            config.tokeninput,
            config.tokenoutput,
            config.content,
            config.previousmsgid || '',
            config.rawData
        ]);
        console.log(`👤 Call OpenAI registered: ${config.msgid}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur save callOpenAI:', error);
        throw error;
    }
}

async function getLastOpenAIMessageId() {
    const query = `
        SELECT msgid
        FROM openaimessages
        ORDER BY created_at DESC
        LIMIT 1
    `;
    try {
        const result = await pool.query(query);
        return result.rows[0] ? result.rows[0]['msgid'] : 0;
    } catch (error) {
        console.error('❌ Erreur get Last openAiMessage:', error);
        throw error;
    }
}

async function getMemberForGrognement() {
    const query = `
        SELECT user_id
        FROM guild_members gm
        WHERE NOT EXISTS (
            SELECT user_id
            FROM grognement gr
            WHERE gm.user_id = gr.user_id
        )
        ORDER BY RANDOM()  
        LIMIT 1
    `;
    try {
        const result = await pool.query(query);
        return result.rows[0] ? result.rows[0]['user_id'] : 0;
    } catch (error) {
        console.error('❌ Erreur getMemberForGrognement:', error);
        throw error;
    }
}

async function addGuildMember(user) {
    const query = `
        INSERT INTO guild_members (user_id, username)
        VALUES (?, ?)
        ON CONFLICT(user_id) 
        DO UPDATE SET username = excluded.username
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [user.id, user.name]);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur addGuildMember:', error);
        throw error;
    }
}

async function addGrognement(user) {
    const query = `
        INSERT INTO grognement (user_id, username)
        VALUES (?, ?)
        ON CONFLICT(user_id) 
        DO UPDATE SET username = excluded.username
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [user.id, user.name]);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur addGrognement:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS CAPTCHA
// ============================================

async function createCaptcha(userId, username, guildId, question, answer, channelId, timeoutMinutes = 10) {
    const query = `
        INSERT INTO user_captchas (
            user_id, username, guild_id, question, answer, channel_id, attempts, created_at, expires_at, is_verified
        ) VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, datetime('now', '+' || ? || ' minutes'), 0)
        ON CONFLICT(user_id, guild_id) 
        DO UPDATE SET
            question = excluded.question,
            answer = excluded.answer,
            channel_id = excluded.channel_id,
            attempts = 0,
            created_at = CURRENT_TIMESTAMP,
            expires_at = excluded.expires_at,
            is_verified = 0,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [
            userId,
            username,
            guildId,
            question,
            answer,
            channelId,
            timeoutMinutes
        ]);
        console.log(`🔒 Captcha créé pour ${username} (${userId}) dans le serveur ${guildId}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur createCaptcha:', error);
        throw error;
    }
}

async function getUserCaptcha(userId, guildId) {
    const query = `
        SELECT * FROM user_captchas 
        WHERE user_id = ? AND guild_id = ? 
        AND (is_verified = 0 OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY created_at DESC
        LIMIT 1
    `;
    try {
        const result = await pool.query(query, [userId, guildId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getUserCaptcha:', error);
        throw error;
    }
}

async function verifyCaptchaAnswer(userId, guildId, userAnswer) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const captcha = await getUserCaptcha(userId, guildId);
        if (!captcha) {
            await client.query('ROLLBACK');
            return { success: false, reason: 'no_captcha_found' };
        }

        if (captcha.is_verified) {
            await client.query('ROLLBACK');
            return { success: false, reason: 'already_verified' };
        }

        if (new Date(captcha.expires_at) < new Date()) {
            await client.query('ROLLBACK');
            return { success: false, reason: 'expired' };
        }

        const correctAnswer = parseInt(captcha.answer, 10);
        const userAnswerInt = parseInt(userAnswer, 10);

        if (userAnswerInt === correctAnswer) {
            const updateQuery = `
                UPDATE user_captchas 
                SET is_verified = 1, 
                    verified_at = CURRENT_TIMESTAMP,
                    attempts = attempts + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                RETURNING *
            `;
            const result = await client.query(updateQuery, [captcha.id]);
            await client.query('COMMIT');
            console.log(`✅ Captcha validé pour ${captcha.username} (${userId})`);
            return { success: true, captcha: result.rows[0] };
        } else {
            const newAttempts = captcha.attempts + 1;
            const updateQuery = `
                UPDATE user_captchas 
                SET attempts = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                RETURNING *
            `;
            await client.query(updateQuery, [newAttempts, captcha.id]);
            await client.query('COMMIT');
            console.log(`❌ Captcha échoué pour ${captcha.username} (${userId}) - Tentative ${newAttempts}`);
            if (newAttempts >= 3) {
                return { success: false, reason: 'max_attempts_reached', attempts: newAttempts };
            }
            return { success: false, reason: 'wrong_answer', attempts: newAttempts };
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur verifyCaptchaAnswer:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function expireCaptcha(userId, guildId, incrementAttempts = false) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let result;
        if (incrementAttempts) {
            const captchaQuery = `
                SELECT attempts FROM user_captchas 
                WHERE user_id = ? AND guild_id = ? AND is_verified = 0
            `;
            const captcha = await client.query(captchaQuery, [userId, guildId]);
            if (captcha.rows.length > 0) {
                const currentAttempts = captcha.rows[0].attempts;
                const newAttempts = currentAttempts + 1;
                const maxAttempts = CAPTCHA_CONFIG.MAX_ATTEMPTS || 3;

                const updateQuery = `
                    UPDATE user_captchas 
                    SET is_verified = 0,
                        attempts = ?,
                        expired_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ? AND guild_id = ? AND is_verified = 0
                    RETURNING *
                `;
                result = await client.query(updateQuery, [newAttempts, userId, guildId]);
                await client.query('COMMIT');
                if (result.rows.length > 0) {
                    console.log(`⏰ Captcha expiré pour ${result.rows[0].username} (${userId}) - Tentatives: ${newAttempts}/${maxAttempts}`);
                    return { captcha: result.rows[0], shouldKick: newAttempts >= maxAttempts };
                }
            }
        } else {
            const query = `
                UPDATE user_captchas 
                SET is_verified = 0,
                    expired_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND guild_id = ? AND is_verified = 0
                RETURNING *
            `;
            result = await client.query(query, [userId, guildId]);
            await client.query('COMMIT');
            if (result.rows.length > 0) {
                console.log(`⏰ Captcha expiré pour ${result.rows[0].username} (${userId})`);
            }
        }
        return { captcha: result?.rows[0] || null, shouldKick: false };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur expireCaptcha:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function isUserVerified(userId, guildId) {
    const query = `
        SELECT is_verified FROM user_captchas 
        WHERE user_id = ? AND guild_id = ? 
        AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC
        LIMIT 1
    `;
    try {
        const result = await pool.query(query, [userId, guildId]);
        return Boolean(result.rows[0]?.is_verified);
    } catch (error) {
        console.error('❌ Erreur isUserVerified:', error);
        throw error;
    }
}

async function deleteCaptcha(userId, guildId) {
    const query = `
        DELETE FROM user_captchas 
        WHERE user_id = ? AND guild_id = ?
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [userId, guildId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur deleteCaptcha:', error);
        throw error;
    }
}

async function saveCaptchaConfig(guildId, config) {
    const query = `
        INSERT INTO captcha_config (
            guild_id, channel_id, verified_role_id, timeout_minutes, max_attempts, is_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id) 
        DO UPDATE SET
            channel_id = excluded.channel_id,
            verified_role_id = excluded.verified_role_id,
            timeout_minutes = excluded.timeout_minutes,
            max_attempts = excluded.max_attempts,
            is_enabled = excluded.is_enabled,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [
            guildId,
            config.channelId,
            config.verifiedRoleId,
            config.timeoutMinutes,
            config.maxAttempts,
            config.isEnabled ? 1 : 0
        ]);
        console.log(`⚙️ Configuration captcha mise à jour pour le serveur ${guildId}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur saveCaptchaConfig:', error);
        throw error;
    }
}

async function getCaptchaConfig(guildId) {
    const query = `SELECT * FROM captcha_config WHERE guild_id = ?`;
    try {
        const result = await pool.query(query, [guildId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getCaptchaConfig:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS BUMP LOGS
// ============================================

async function saveBump(guildId, channelId, userId = null, username = null) {
    const query = `
        INSERT INTO bump_logs (guild_id, channel_id, user_id, username, bumped_at, reminder_sent)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [guildId, channelId, userId, username]);
        console.log(`📌 Bump enregistré en BDD pour le serveur ${guildId} par ${username || userId || 'inconnu'}`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur saveBump:', error);
        throw error;
    }
}

async function getPendingBumpReminders() {
    const query = `
        SELECT * FROM bump_logs
        WHERE reminder_sent = 0
          AND (strftime('%s', 'now') - strftime('%s', bumped_at)) >= 7200
        ORDER BY bumped_at ASC
    `;
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur getPendingBumpReminders:', error);
        throw error;
    }
}

async function markBumpReminderSent(bumpId) {
    const query = `
        UPDATE bump_logs
        SET reminder_sent = 1, reminder_sent_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [bumpId]);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur markBumpReminderSent:', error);
        throw error;
    }
}

async function getLastBump(guildId) {
    const query = `
        SELECT * FROM bump_logs
        WHERE guild_id = ?
        ORDER BY bumped_at DESC
        LIMIT 1
    `;
    try {
        const result = await pool.query(query, [guildId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getLastBump:', error);
        throw error;
    }
}

module.exports = {
    pool,
    logUserEvent,
    getUserEvents,
    saveFormResponse,
    getGlobalStats,
    setBirthday,
    getBirthday,
    deleteBirthday,
    getTodayBirthdays,
    getUpcomingBirthdays,
    calculateXPForLevel,
    calculateLevel,
    getOrCreateUserXP,
    addXP,
    addMessageXP,
    startVoiceSession,
    endVoiceSession,
    getUserXPInfo,
    getLeaderboard,
    getUserRank,
    createEvent,
    addEventParticipant,
    registerNewMember,
    logMemberEvent,
    updateMemberRoles,
    markMemberLeft,
    getMemberInfo,
    getRecentMembers,
    getMemberHistory,
    getWelcomeConfig,
    saveWelcomeConfig,
    saveOpenAIMessage,
    getLastOpenAIMessageId,
    addGuildMember,
    addGrognement,
    getMemberForGrognement,
    createCaptcha,
    getUserCaptcha,
    verifyCaptchaAnswer,
    expireCaptcha,
    isUserVerified,
    deleteCaptcha,
    saveCaptchaConfig,
    getCaptchaConfig,
    // Fonctions Bump
    saveBump,
    getPendingBumpReminders,
    markBumpReminderSent,
    getLastBump,
    // Fonctions Dump Discord
    saveDumpUser,
    saveDumpChannel,
    saveDumpThread,
    saveDumpMessagesBatch,
    // Fonctions Counter Game
    getCounterState,
    updateCounterState,
    // Fonctions CountDown Game
    getCountdownState,
    updateCountdownState,
    addCountdownScore,
    getCountdownScores,
    resetCountdownScores
};

// ============================================
// FONCTIONS DU JEU COUNTDOWN (COMPTE À REBOURS 90 -> 0)
// ============================================

async function getCountdownState(channelId) {
    const query = `SELECT * FROM countdown_state WHERE channel_id = ?`;
    try {
        const result = await pool.query(query, [channelId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getCountdownState:', error);
        throw error;
    }
}

async function updateCountdownState(channelId, currentNumber, isTrapActive = 0, trapNumber = null, lastUserId = null) {
    const query = `
        INSERT INTO countdown_state (channel_id, current_number, is_trap_active, trap_number, last_user_id, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(channel_id) DO UPDATE SET
            current_number = excluded.current_number,
            is_trap_active = excluded.is_trap_active,
            trap_number = excluded.trap_number,
            last_user_id = excluded.last_user_id,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [channelId, currentNumber, isTrapActive, trapNumber, lastUserId]);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur updateCountdownState:', error);
        throw error;
    }
}

async function addCountdownScore(channelId, userId, username) {
    const query = `
        INSERT INTO countdown_scores (channel_id, user_id, username, score)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(channel_id, user_id) DO UPDATE SET
            score = score + 1,
            username = excluded.username
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [channelId, userId, username]);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur addCountdownScore:', error);
        throw error;
    }
}

async function getCountdownScores(channelId) {
    const query = `
        SELECT user_id, username, score
        FROM countdown_scores
        WHERE channel_id = ?
        ORDER BY score DESC
    `;
    try {
        const result = await pool.query(query, [channelId]);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur getCountdownScores:', error);
        throw error;
    }
}

async function resetCountdownScores(channelId) {
    const query = `DELETE FROM countdown_scores WHERE channel_id = ?`;
    try {
        await pool.query(query, [channelId]);
    } catch (error) {
        console.error('❌ Erreur resetCountdownScores:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS DU JEU DES NOMBRES (COUNTER)
// ============================================

async function getCounterState(channelId) {
    const query = `SELECT * FROM counter_state WHERE channel_id = ?`;
    try {
        const result = await pool.query(query, [channelId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getCounterState:', error);
        throw error;
    }
}

async function updateCounterState(channelId, newNumber, userId = null) {
    const query = `
        INSERT INTO counter_state (channel_id, current_number, last_user_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(channel_id) DO UPDATE SET
            current_number = excluded.current_number,
            last_user_id = excluded.last_user_id,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    try {
        const result = await pool.query(query, [channelId, newNumber, userId]);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Erreur updateCounterState:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS DE SAUVEGARDE / DUMP DISCORD
// ============================================

async function saveDumpUser(user) {
    const query = `
        INSERT INTO discord_users (user_id, username, global_name, discriminator, bot, avatar_url, banner_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            username = excluded.username,
            global_name = excluded.global_name,
            discriminator = excluded.discriminator,
            bot = excluded.bot,
            avatar_url = excluded.avatar_url,
            banner_url = excluded.banner_url,
            updated_at = CURRENT_TIMESTAMP
    `;
    try {
        await pool.query(query, [
            user.id,
            user.username,
            user.globalName || null,
            user.discriminator || '0',
            user.bot ? 1 : 0,
            user.displayAvatarURL ? user.displayAvatarURL({ size: 512 }) : null,
            user.bannerURL ? user.bannerURL({ size: 512 }) : null,
            user.createdAt ? user.createdAt.toISOString() : new Date().toISOString()
        ]);
    } catch (error) {
        console.error('❌ Erreur saveDumpUser:', error);
    }
}

async function saveDumpChannel(channel) {
    const query = `
        INSERT INTO discord_channels (channel_id, guild_id, name, type, parent_id, position, topic, is_nsfw, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            parent_id = excluded.parent_id,
            position = excluded.position,
            topic = excluded.topic,
            is_nsfw = excluded.is_nsfw,
            updated_at = CURRENT_TIMESTAMP
    `;
    try {
        await pool.query(query, [
            channel.id,
            channel.guildId,
            channel.name || 'Unnamed',
            String(channel.type),
            channel.parentId || null,
            channel.position || 0,
            channel.topic || null,
            channel.nsfw ? 1 : 0,
            channel.createdAt ? channel.createdAt.toISOString() : new Date().toISOString()
        ]);
    } catch (error) {
        console.error('❌ Erreur saveDumpChannel:', error);
    }
}

async function saveDumpThread(thread) {
    const query = `
        INSERT INTO discord_threads (thread_id, guild_id, parent_id, name, owner_id, archived, locked, message_count, member_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
            name = excluded.name,
            archived = excluded.archived,
            locked = excluded.locked,
            message_count = excluded.message_count,
            member_count = excluded.member_count,
            updated_at = CURRENT_TIMESTAMP
    `;
    try {
        await pool.query(query, [
            thread.id,
            thread.guildId,
            thread.parentId,
            thread.name,
            thread.ownerId || null,
            thread.archived ? 1 : 0,
            thread.locked ? 1 : 0,
            thread.messageCount || 0,
            thread.memberCount || 0,
            thread.createdAt ? thread.createdAt.toISOString() : new Date().toISOString()
        ]);
    } catch (error) {
        console.error('❌ Erreur saveDumpThread:', error);
    }
}

async function saveDumpMessagesBatch(messages) {
    if (!messages || messages.length === 0) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const query = `
            INSERT INTO discord_messages (
                message_id, channel_id, thread_id, guild_id, author_id, author_username, content, pinned, embeds_json, attachments_json, reactions_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(message_id) DO UPDATE SET
                content = excluded.content,
                pinned = excluded.pinned,
                embeds_json = excluded.embeds_json,
                attachments_json = excluded.attachments_json,
                reactions_json = excluded.reactions_json,
                updated_at = CURRENT_TIMESTAMP
        `;

        for (const msg of messages) {
            const author = msg.author;
            const embeds = msg.embeds ? msg.embeds.map(e => e.toJSON ? e.toJSON() : e) : [];
            const attachments = msg.attachments ? Array.from(msg.attachments.values()).map(a => ({
                id: a.id,
                name: a.name,
                url: a.url,
                size: a.size,
                contentType: a.contentType
            })) : [];
            const reactions = msg.reactions?.cache ? Array.from(msg.reactions.cache.values()).map(r => ({
                emoji: r.emoji.name,
                count: r.count
            })) : [];

            await client.query(query, [
                msg.id,
                msg.channelId,
                msg.channel?.isThread?.() ? msg.channel.id : null,
                msg.guildId || 'unknown',
                author.id,
                author.username || author.tag || 'Unknown',
                msg.content || '',
                msg.pinned ? 1 : 0,
                JSON.stringify(embeds),
                JSON.stringify(attachments),
                JSON.stringify(reactions),
                msg.createdAt ? msg.createdAt.toISOString() : new Date().toISOString()
            ]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur saveDumpMessagesBatch:', error);
    } finally {
        client.release();
    }
}