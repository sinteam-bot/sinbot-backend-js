const { Pool } = require('pg');
require('dotenv').config();

// Configuration du captcha
const CAPTCHA_CONFIG = require('./config/captcha-config');

// Configuration de la connexion PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Test de connexion au démarrage
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Erreur de connexion à PostgreSQL:', err);
        process.exit(1);
    } else {
        console.log('✅ Connexion à PostgreSQL réussie');
        console.log('📅 Date serveur:', res.rows[0].now);
    }
});

/**
 * Enregistrer un événement utilisateur
 */
async function logUserEvent(userId, username, eventType, eventData = {}) {
    const query = `
        INSERT INTO user_events (user_id, username, event_type, event_data)
        VALUES ($1, $2, $3, $4)
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
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
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
        VALUES ($1, $2, $3, $4)
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
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            username = $2,
            birthdate = $3,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, birthdate, 
            CASE 
                WHEN user_birthdays.created_at = user_birthdays.updated_at 
                THEN 'created' 
                ELSE 'updated' 
            END as action
    `;
    
    try {
        const result = await pool.query(query, [userId, username, birthdate]);
        console.log(`🎂 Date de naissance ${result.rows[0].action} pour ${username}`);
        return result.rows[0];
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
            EXTRACT(YEAR FROM AGE(birthdate)) as age,
            TO_CHAR(birthdate, 'DD/MM/YYYY') as formatted_date,
            created_at,
            updated_at
        FROM user_birthdays
        WHERE user_id = $1
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
        WHERE user_id = $1
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
            EXTRACT(YEAR FROM AGE(birthdate)) as age
        FROM user_birthdays
        WHERE 
            EXTRACT(MONTH FROM birthdate) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(DAY FROM birthdate) = EXTRACT(DAY FROM CURRENT_DATE)
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
    const query = `
        SELECT 
            user_id,
            username,
            birthdate,
            TO_CHAR(birthdate, 'DD/MM') as birthday_date,
            EXTRACT(YEAR FROM AGE(birthdate)) as current_age,
            CASE
                WHEN EXTRACT(MONTH FROM birthdate) = EXTRACT(MONTH FROM CURRENT_DATE)
                     AND EXTRACT(DAY FROM birthdate) >= EXTRACT(DAY FROM CURRENT_DATE)
                THEN EXTRACT(DAY FROM birthdate) - EXTRACT(DAY FROM CURRENT_DATE)
                WHEN EXTRACT(MONTH FROM birthdate) > EXTRACT(MONTH FROM CURRENT_DATE)
                THEN DATE_PART('day', 
                    (DATE_TRUNC('year', CURRENT_DATE) + 
                     INTERVAL '1 year' * EXTRACT(MONTH FROM birthdate - 1) + 
                     INTERVAL '1 day' * EXTRACT(DAY FROM birthdate - 1)) - CURRENT_DATE
                )
                ELSE DATE_PART('day',
                    (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' +
                     INTERVAL '1 month' * EXTRACT(MONTH FROM birthdate - 1) +
                     INTERVAL '1 day' * EXTRACT(DAY FROM birthdate - 1)) - CURRENT_DATE
                )
            END as days_until
        FROM user_birthdays
        ORDER BY days_until ASC
        LIMIT $1
    `;
    
    try {
        const result = await pool.query(query, [days]);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des anniversaires à venir:', error);
        throw error;
    }
}
// ============================================
// FONCTIONS XP & LEVELS
// ============================================

const XP_CONFIG = require('./config/xp-config');

/**
 * Calculer l'XP requis pour un niveau donné
 */
function calculateXPForLevel(level) {
    return Math.floor(XP_CONFIG.LEVEL.BASE_XP * Math.pow(level, XP_CONFIG.LEVEL.MULTIPLIER));
}

/**
 * Calculer le niveau en fonction de l'XP total
 */
function calculateLevel(totalXP) {
    let level = 1;
    let xpRequired = calculateXPForLevel(level);
    
    while (totalXP >= xpRequired) {
        level++;
        xpRequired = calculateXPForLevel(level);
    }
    
    return level - 1;
}

/**
 * Récupérer ou créer un utilisateur dans le système XP
 */
async function getOrCreateUserXP(userId, username) {
    const selectQuery = 'SELECT * FROM user_xp WHERE user_id = $1';
    const insertQuery = `
        INSERT INTO user_xp (user_id, username, xp, level)
        VALUES ($1, $2, 0, 1)
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

/**
 * Ajouter de l'XP à un utilisateur
 */
async function addXP(userId, username, xpAmount, xpType = 'message', description = null, metadata = {}) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Récupérer l'utilisateur
        let user = await getOrCreateUserXP(userId, username);
        
        // IMPORTANT : S'assurer que xpAmount est un nombre
        const xpToAdd = parseInt(xpAmount, 10);
        
        // Calculer le nouvel XP et niveau
        const currentXP = parseInt(user.xp, 10) || 0;  // S'assurer que c'est un nombre
        const newTotalXP = currentXP + xpToAdd;
        const oldLevel = user.level;
        const newLevel = calculateLevel(newTotalXP);
        
        // Mettre à jour l'utilisateur
        const updateQuery = `
            UPDATE user_xp 
            SET xp = $1::BIGINT, 
                level = $2, 
                total_xp_earned = total_xp_earned + $3::BIGINT,
                username = $4,
                messages_count = CASE WHEN $5 = 'message' THEN messages_count + 1 ELSE messages_count END,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $6
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
        
        // Enregistrer la transaction
        const transactionQuery = `
            INSERT INTO xp_transactions (user_id, username, xp_amount, xp_type, description, metadata)
            VALUES ($1, $2, $3::INTEGER, $4, $5, $6)
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

/**
 * Ajouter de l'XP pour un message (avec cooldown)
 */
async function addMessageXP(userId, username) {
    try {
        const user = await getOrCreateUserXP(userId, username);
        
        // Vérifier le cooldown
        if (user.last_message_xp) {
            const lastXP = new Date(user.last_message_xp);
            const now = new Date();
            const secondsSinceLastXP = (now - lastXP) / 1000;
            
            if (secondsSinceLastXP < XP_CONFIG.MESSAGE_XP.COOLDOWN) {
                return { success: false, reason: 'cooldown' };
            }
        }
        
        // Calculer l'XP aléatoire
        const xpAmount = Math.floor(
            Math.random() * (XP_CONFIG.MESSAGE_XP.MAX - XP_CONFIG.MESSAGE_XP.MIN + 1)
        ) + XP_CONFIG.MESSAGE_XP.MIN;
        
        // Mettre à jour le timestamp du dernier message XP
        await pool.query(
            'UPDATE user_xp SET last_message_xp = CURRENT_TIMESTAMP WHERE user_id = $1',
            [userId]
        );
        
        // Ajouter l'XP
        const result = await addXP(userId, username, xpAmount, 'message', 'Message XP');
        
        return { success: true, ...result };
        
    } catch (error) {
        console.error('❌ Erreur addMessageXP:', error);
        return { success: false, reason: 'error' };
    }
}

/**
 * Démarrer une session vocale
 */
async function startVoiceSession(userId, username, channelId, channelName) {
    const query = `
        INSERT INTO voice_sessions (user_id, username, channel_id, channel_name, join_time)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
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

/**
 * Récupérer ou créer un utilisateur dans le système XP
 */
async function getOrCreateUserXP(userId, username) {
    const selectQuery = 'SELECT * FROM user_xp WHERE user_id = $1';
    const insertQuery = `
        INSERT INTO user_xp (user_id, username, xp, level)
        VALUES ($1, $2, 0::BIGINT, 1)
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


/**
 * Terminer une session vocale et donner l'XP
 */
async function endVoiceSession(userId, username) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Trouver la session active
        const findQuery = `
            SELECT * FROM voice_sessions 
            WHERE user_id = $1 AND leave_time IS NULL
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
        
        // Calculer l'XP gagné
        const xpEarned = durationMinutes * XP_CONFIG.VOICE_XP.PER_MINUTE;
        
        // Mettre à jour la session
        const updateQuery = `
            UPDATE voice_sessions 
            SET leave_time = CURRENT_TIMESTAMP,
                duration_minutes = $1,
                xp_earned = $2
            WHERE id = $3
        `;
        
        await client.query(updateQuery, [durationMinutes, xpEarned, sessionData.id]);
        
        // Ajouter l'XP si la durée est suffisante
        if (durationMinutes >= XP_CONFIG.VOICE_XP.MIN_DURATION && xpEarned > 0) {
            await addXP(
                userId,
                username,
                xpEarned,
                'voice',
                `${durationMinutes} minutes en vocal`,
                { channel: sessionData.channel_name, duration: durationMinutes }
            );
            
            // Mettre à jour le compteur de minutes vocales
            await client.query(
                'UPDATE user_xp SET voice_minutes = voice_minutes + $1 WHERE user_id = $2',
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

/**
 * Récupérer les informations XP d'un utilisateur
 */
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

/**
 * Récupérer le leaderboard
 */
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
        LIMIT $1
    `;
    
    try {
        const result = await pool.query(query, [limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur getLeaderboard:', error);
        throw error;
    }
}

/**
 * Récupérer le rang d'un utilisateur
 */
async function getUserRank(userId) {
    const query = `
        WITH ranked_users AS (
            SELECT 
                user_id,
                ROW_NUMBER() OVER (ORDER BY xp DESC) as rank
            FROM user_xp
        )
        SELECT rank FROM ranked_users WHERE user_id = $1
    `;
    
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0]?.rank || null;
    } catch (error) {
        console.error('❌ Erreur getUserRank:', error);
        throw error;
    }
}

/**
 * Créer un événement
 */
async function createEvent(eventName, eventDescription, eventDate, xpReward, createdBy) {
    const query = `
        INSERT INTO events (event_name, event_description, event_date, xp_reward, created_by)
        VALUES ($1, $2, $3, $4, $5)
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

/**
 * Ajouter un participant à un événement
 */
async function addEventParticipant(eventId, userId, username) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Récupérer l'événement
        const eventQuery = 'SELECT * FROM events WHERE id = $1 AND is_active = true';
        const event = await client.query(eventQuery, [eventId]);
        
        if (event.rows.length === 0) {
            throw new Error('Événement introuvable ou inactif');
        }
        
        const eventData = event.rows[0];
        
        // Ajouter le participant
        const participantQuery = `
            INSERT INTO event_participants (event_id, user_id, username, xp_earned)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (event_id, user_id) DO NOTHING
            RETURNING *
        `;
        
        const participant = await client.query(participantQuery, [
            eventId,
            userId,
            username,
            eventData.xp_reward
        ]);
        
        if (participant.rows.length > 0) {
            // Donner l'XP
            await addXP(
                userId,
                username,
                eventData.xp_reward,
                'event',
                `Participation à: ${eventData.event_name}`,
                { event_id: eventId, event_name: eventData.event_name }
            );
            
            // Incrémenter le compteur d'événements
            await client.query(
                'UPDATE user_xp SET events_participated = events_participated + 1 WHERE user_id = $1',
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

/**
 * Enregistrer un nouveau membre
 */
async function registerNewMember(member) {
    const query = `
        INSERT INTO server_members (
            user_id,
            username,
            discriminator,
            tag,
            display_name,
            avatar_url,
            joined_at,
            account_created_at,
            is_bot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id) 
        DO UPDATE SET
            username = $2,
            discriminator = $3,
            tag = $4,
            display_name = $5,
            avatar_url = $6,
            rejoin_count = server_members.rejoin_count + 1,
            joined_at = $7,
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
            member.user.bot
        ]);
        
        console.log(`👤 Membre enregistré: ${member.user.tag}`);
        return result.rows[0];
        
    } catch (error) {
        console.error('❌ Erreur registerNewMember:', error);
        throw error;
    }
}

/**
 * Enregistrer un événement membre (arrivée, départ, etc.)
 */
async function logMemberEvent(userId, username, action, guildId, metadata = {}) {
    const query = `
        INSERT INTO member_history (user_id, username, action, guild_id, metadata)
        VALUES ($1, $2, $3, $4, $5)
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

/**
 * Mettre à jour les rôles d'un membre
 */
async function updateMemberRoles(userId, roles) {
    const rolesArray = roles.map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor
    }));
    
    const query = `
        UPDATE server_members 
        SET roles = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
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

/**
 * Marquer un membre comme parti
 */
async function markMemberLeft(userId) {
    const query = `
        UPDATE server_members 
        SET left_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
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

/**
 * Récupérer les informations d'un membre
 */
async function getMemberInfo(userId) {
    const query = `
        SELECT * FROM server_members WHERE user_id = $1
    `;
    
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getMemberInfo:', error);
        throw error;
    }
}

/**
 * Récupérer les derniers membres arrivés
 */
async function getRecentMembers(limit = 10) {
    const query = `
        SELECT * FROM server_members 
        WHERE left_at IS NULL
        ORDER BY joined_at DESC 
        LIMIT $1
    `;
    
    try {
        const result = await pool.query(query, [limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur getRecentMembers:', error);
        throw error;
    }
}

/**
 * Récupérer l'historique d'un membre
 */
async function getMemberHistory(userId, limit = 20) {
    const query = `
        SELECT * FROM member_history 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
    `;
    
    try {
        const result = await pool.query(query, [userId, limit]);
        return result.rows;
    } catch (error) {
        console.error('❌ Erreur getMemberHistory:', error);
        throw error;
    }
}

/**
 * Récupérer la configuration d'accueil
 */
async function getWelcomeConfig(guildId) {
    const query = `
        SELECT * FROM welcome_config WHERE guild_id = $1
    `;
    
    try {
        const result = await pool.query(query, [guildId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getWelcomeConfig:', error);
        throw error;
    }
}

/**
 * Sauvegarder la configuration d'accueil
 */
async function saveWelcomeConfig(guildId, config) {
    const query = `
        INSERT INTO welcome_config (guild_id, welcome_channel_id, welcome_message, auto_roles, is_enabled)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (guild_id) 
        DO UPDATE SET
            welcome_channel_id = $2,
            welcome_message = $3,
            auto_roles = $4,
            is_enabled = $5,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    
    try {
        const result = await pool.query(query, [
            guildId,
            config.channelId,
            config.message,
            JSON.stringify(config.autoRoles),
            config.enabled
        ]);
        
        console.log(`⚙️ Configuration d'accueil mise à jour pour le serveur ${guildId}`);
        return result.rows[0];
        
    } catch (error) {
        console.error('❌ Erreur saveWelcomeConfig:', error);
        throw error;
    }
}


/**
 * Function de sauvegarde des messages OpenIA
 */
async function saveOpenAIMessage(config){
    const query = `
        INSERT INTO openaimessages (
            msgid,
            prompt,
            instruction,
            model,
            tokeninput,
            tokenoutput,
            content,
            previousmsgid,
            created_at,
            rawdata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP,$9)
        ON CONFLICT (msgid) 
        DO UPDATE SET
            prompt = $2,
            instruction = $3,
            model = $4,
            tokeninput = $5,
            tokenoutput = $6,
            content = $7,
            previousmsgid = $8,
            updated_at = CURRENT_TIMESTAMP,
            rawdata = $9
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

async function getLastOpenAIMessageId(){
    const query = `
        SELECT msgid
            FROM openaimessages
            ORDER BY created_at DESC
            LIMIT 1;
        `
    try {
        const result = await pool.query(query)
        return result.rows[0]['msgid']
    } catch (error) {
        console.error('❌ Erreur get Last openAiMessage:', error);
        throw error;
    }
    return 0;
}

async function getMemberForGrognement(){
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
        `
    try {
        const result = await pool.query(query)
        return result.rows[0]['user_id']
    } catch (error) {
        console.error('❌ Erreur get Last openAiMessage:', error);
        throw error;
    }
    return 0;
}

async function addGuildMember(user){
       const query = `
        INSERT INTO guild_members (
            user_id,
            username
        ) VALUES ($1, $2)
        ON CONFLICT (user_id) 
        DO UPDATE SET
            username = $2
        RETURNING *
    `;
    
    try {
        const result = await pool.query(query, [
            user.id,
            user.name
        ]);
        
        return result.rows[0];
        
    } catch (error) {
        console.error('❌ Erreur save callOpenAI:', error);
        throw error;
    } 
}

async function addGrognement(user){
           const query = `
        INSERT INTO grognement (
            user_id,
            username
        ) VALUES ($1, $2)
        ON CONFLICT (user_id) 
        DO UPDATE SET
            username = $2
        RETURNING *
    `;
    
    try {
        const result = await pool.query(query, [
            user.id,
            user.name
        ]);
        
        return result.rows[0];
        
    } catch (error) {
        console.error('❌ Erreur save callOpenAI:', error);
        throw error;
    } 

}

// ============================================
// FONCTIONS CAPTCHA
// ============================================

/**
 * Créer un nouveau captcha pour un utilisateur
 */
async function createCaptcha(userId, username, guildId, question, answer, channelId, timeoutMinutes = 10) {
    const query = `
        INSERT INTO user_captchas (
            user_id,
            username,
            guild_id,
            question,
            answer,
            channel_id,
            attempts,
            created_at,
            expires_at,
            is_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($7 * INTERVAL '1 minute'), false)
        ON CONFLICT (user_id, guild_id) 
        DO UPDATE SET
            question = $4,
            answer = $5,
            channel_id = $6,
            attempts = 0,
            created_at = CURRENT_TIMESTAMP,
            expires_at = CURRENT_TIMESTAMP + ($7 * INTERVAL '1 minute'),
            is_verified = false,
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

/**
 * Récupérer le captcha d'un utilisateur
 */
async function getUserCaptcha(userId, guildId) {
    const query = `
        SELECT * FROM user_captchas 
        WHERE user_id = $1 AND guild_id = $2 
        AND (is_verified = false OR expires_at > CURRENT_TIMESTAMP)
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

/**
 * Vérifier la réponse au captcha
 */
async function verifyCaptchaAnswer(userId, guildId, userAnswer) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Récupérer le captcha
        const captcha = await getUserCaptcha(userId, guildId);
        
        if (!captcha) {
            await client.query('ROLLBACK');
            return { success: false, reason: 'no_captcha_found' };
        }
        
        // Vérifier si déjà vérifié
        if (captcha.is_verified) {
            await client.query('ROLLBACK');
            return { success: false, reason: 'already_verified' };
        }
        
        // Vérifier si expiré
        if (new Date(captcha.expires_at) < new Date()) {
            await client.query('ROLLBACK');
            return { success: false, reason: 'expired' };
        }
        
        // Vérifier la réponse
        const correctAnswer = parseInt(captcha.answer, 10);
        const userAnswerInt = parseInt(userAnswer, 10);
        
        if (userAnswerInt === correctAnswer) {
            // Réponse correcte
            const updateQuery = `
                UPDATE user_captchas 
                SET is_verified = true, 
                    verified_at = CURRENT_TIMESTAMP,
                    attempts = attempts + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `;
            
            const result = await client.query(updateQuery, [captcha.id]);
            await client.query('COMMIT');
            
            console.log(`✅ Captcha validé pour ${captcha.username} (${userId})`);
            return { success: true, captcha: result.rows[0] };
        } else {
            // Réponse incorrecte
            const newAttempts = captcha.attempts + 1;
            
            const updateQuery = `
                UPDATE user_captchas 
                SET attempts = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `;
            
            const result = await client.query(updateQuery, [newAttempts, captcha.id]);
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

/**
 * Marquer un captcha comme expiré et optionnellement incrémenter les tentatives
 */
async function expireCaptcha(userId, guildId, incrementAttempts = false) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        let result;
        
        if (incrementAttempts) {
            // Incrémenter les tentatives et vérifier si max atteint
            const captchaQuery = `
                SELECT attempts FROM user_captchas 
                WHERE user_id = $1 AND guild_id = $2 AND is_verified = false
            `;
            const captcha = await client.query(captchaQuery, [userId, guildId]);
            
            if (captcha.rows.length > 0) {
                const currentAttempts = captcha.rows[0].attempts;
                const newAttempts = currentAttempts + 1;
                const maxAttempts = CAPTCHA_CONFIG.MAX_ATTEMPTS || 3;
                
                const updateQuery = `
                    UPDATE user_captchas 
                    SET is_verified = false,
                        attempts = $1,
                        expired_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $2 AND guild_id = $3 AND is_verified = false
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
                SET is_verified = false,
                    expired_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1 AND guild_id = $2 AND is_verified = false
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

/**
 * Vérifier si un utilisateur est vérifié (a passé le captcha)
 */
async function isUserVerified(userId, guildId) {
    const query = `
        SELECT is_verified FROM user_captchas 
        WHERE user_id = $1 AND guild_id = $2 
        AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC
        LIMIT 1
    `;
    
    try {
        const result = await pool.query(query, [userId, guildId]);
        return result.rows[0]?.is_verified || false;
    } catch (error) {
        console.error('❌ Erreur isUserVerified:', error);
        throw error;
    }
}

/**
 * Supprimer un captcha
 */
async function deleteCaptcha(userId, guildId) {
    const query = `
        DELETE FROM user_captchas 
        WHERE user_id = $1 AND guild_id = $2
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

/**
 * Sauvegarder la configuration du captcha pour un serveur
 */
async function saveCaptchaConfig(guildId, config) {
    const query = `
        INSERT INTO captcha_config (
            guild_id,
            channel_id,
            verified_role_id,
            timeout_minutes,
            max_attempts,
            is_enabled,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (guild_id) 
        DO UPDATE SET
            channel_id = $2,
            verified_role_id = $3,
            timeout_minutes = $4,
            max_attempts = $5,
            is_enabled = $6,
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
            config.isEnabled
        ]);
        
        console.log(`⚙️ Configuration captcha mise à jour pour le serveur ${guildId}`);
        return result.rows[0];
        
    } catch (error) {
        console.error('❌ Erreur saveCaptchaConfig:', error);
        throw error;
    }
}

/**
 * Récupérer la configuration du captcha pour un serveur
 */
async function getCaptchaConfig(guildId) {
    const query = `
        SELECT * FROM captcha_config WHERE guild_id = $1
    `;
    
    try {
        const result = await pool.query(query, [guildId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erreur getCaptchaConfig:', error);
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
    // Fonctions Captcha
    createCaptcha,
    getUserCaptcha,
    verifyCaptchaAnswer,
    expireCaptcha,
    isUserVerified,
    deleteCaptcha,
    saveCaptchaConfig,
    getCaptchaConfig
};