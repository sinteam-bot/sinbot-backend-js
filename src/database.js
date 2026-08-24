const { eq, and, or, sql, desc, asc, count, gt, gte, lt, lte, inArray } = require('drizzle-orm');
const { db, schema, rawClient, isPostgres, isSqlite, dialect } = require('./db/index.js');
const { toISOStringSafe } = require('./utils/dateUtils.js');

// Configuration XP et Captcha
const XP_CONFIG = require("./modules/feature_xp-level/xp.config.js");
const CAPTCHA_CONFIG = require("./modules/security_question/captcha.config.js");

// ============================================
// ADAPTATEUR DE COMPATIBILITÉ POOL
// ============================================
const pool = {
    query: async (sqlText, params = []) => {
        if (isPostgres) {
            return rawClient.query(sqlText, params);
        } else {
            let cleanSql = sqlText.replace(/::[a-zA-Z]+/g, '').replace(/\$\d+/g, '?');
            const trimmed = cleanSql.trim().toUpperCase();
            if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
                const stmt = rawClient.prepare(cleanSql);
                const rows = stmt.all(...params);
                return { rows };
            } else {
                const stmt = rawClient.prepare(cleanSql);
                if (cleanSql.toUpperCase().includes('RETURNING')) {
                    const rows = stmt.all(...params);
                    return { rows };
                } else {
                    const info = stmt.run(...params);
                    return { rows: [{ id: info.lastInsertRowid }], changes: info.changes };
                }
            }
        }
    },
    connect: async () => {
        if (isPostgres) {
            return rawClient.connect();
        } else {
            let inTx = false;
            return {
                query: async (sqlText, params = []) => {
                    const trimmed = sqlText.trim().toUpperCase();
                    if (trimmed === 'BEGIN') {
                        rawClient.exec('BEGIN TRANSACTION');
                        inTx = true;
                        return { rows: [] };
                    } else if (trimmed === 'COMMIT') {
                        if (inTx) rawClient.exec('COMMIT');
                        inTx = false;
                        return { rows: [] };
                    } else if (trimmed === 'ROLLBACK') {
                        if (inTx) rawClient.exec('ROLLBACK');
                        inTx = false;
                        return { rows: [] };
                    } else {
                        return pool.query(sqlText, params);
                    }
                },
                release: () => {}
            };
        }
    }
};

// ============================================
// FONCTIONS ÉVÉNEMENTS UTILISATEURS
// ============================================

async function logUserEvent(userId, username, eventType, eventData = null) {
    try {
        const payload = typeof eventData === 'object' && eventData !== null
            ? JSON.stringify(eventData)
            : (eventData ? String(eventData) : null);

        const [inserted] = await db.insert(schema.userEvents)
            .values({
                userId,
                username,
                eventType,
                eventData: payload
            })
            .returning();

        return inserted;
    } catch (error) {
        console.error('❌ Erreur logUserEvent:', error);
        throw error;
    }
}

async function getUserEvents(userId, limit = 50) {
    try {
        const rows = await db.select()
            .from(schema.userEvents)
            .where(eq(schema.userEvents.userId, userId))
            .orderBy(desc(schema.userEvents.createdAt))
            .limit(limit);

        return rows.map(event => {
            let parsedData = event.eventData;
            if (parsedData && typeof parsedData === 'string') {
                try {
                    parsedData = JSON.parse(parsedData);
                } catch {
                    // Laisser tel quel si non JSON
                }
            }
            return {
                ...event,
                event_data: parsedData,
                user_id: event.userId,
                event_type: event.eventType,
                created_at: event.createdAt
            };
        });
    } catch (error) {
        console.error('❌ Erreur getUserEvents:', error);
        throw error;
    }
}

async function saveFormResponse(userId, username, formName, responses) {
    try {
        const payload = typeof responses === 'object' && responses !== null
            ? JSON.stringify(responses)
            : String(responses);

        const [inserted] = await db.insert(schema.formResponses)
            .values({
                userId,
                username,
                formName,
                responses: payload
            })
            .returning();

        return inserted;
    } catch (error) {
        console.error('❌ Erreur saveFormResponse:', error);
        throw error;
    }
}

async function getGlobalStats() {
    try {
        const result = await db.select({
            eventType: schema.userEvents.eventType,
            event_type: schema.userEvents.eventType,
            count: count(),
            total_events: count(),
            total_users: sql`count(distinct ${schema.userEvents.userId})`
        })
        .from(schema.userEvents)
        .groupBy(schema.userEvents.eventType)
        .orderBy(desc(count()));

        return result;
    } catch (error) {
        console.error('❌ Erreur getGlobalStats:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS ANNIVERSAIRES (BIRTHDAYS)
// ============================================

async function setBirthday(userId, username, birthdate) {
    try {
        const [row] = await db.insert(schema.userBirthdays)
            .values({
                userId,
                username,
                birthdate,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.userBirthdays.userId,
                set: {
                    username,
                    birthdate,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();

        return row;
    } catch (error) {
        console.error('❌ Erreur setBirthday:', error);
        throw error;
    }
}

async function getBirthday(userId) {
    try {
        const [row] = await db.select()
            .from(schema.userBirthdays)
            .where(eq(schema.userBirthdays.userId, userId))
            .limit(1);

        if (!row) return null;
        return {
            ...row,
            user_id: row.userId,
            created_at: row.createdAt,
            updated_at: row.updatedAt
        };
    } catch (error) {
        console.error('❌ Erreur getBirthday:', error);
        throw error;
    }
}

async function deleteBirthday(userId) {
    try {
        const [deleted] = await db.delete(schema.userBirthdays)
            .where(eq(schema.userBirthdays.userId, userId))
            .returning();

        return deleted || null;
    } catch (error) {
        console.error('❌ Erreur deleteBirthday:', error);
        throw error;
    }
}

async function getTodayBirthdays() {
    try {
        const rows = await db.select()
            .from(schema.userBirthdays)
            .where(
                isPostgres
                    ? sql`to_char(cast(${schema.userBirthdays.birthdate} as date), 'MM-DD') = to_char(CURRENT_DATE, 'MM-DD')`
                    : sql`strftime('%m-%d', ${schema.userBirthdays.birthdate}) = strftime('%m-%d', 'now')`
            );

        return rows.map(r => ({
            ...r,
            user_id: r.userId,
            created_at: r.createdAt,
            updated_at: r.updatedAt
        }));
    } catch (error) {
        console.error('❌ Erreur getTodayBirthdays:', error);
        throw error;
    }
}

async function getUpcomingBirthdays(days = 7) {
    try {
        // Sélection de tous les anniversaires et calcul en JS pour une robustesse parfaite multi-dialectes
        const rows = await db.select().from(schema.userBirthdays);
        const today = new Date();
        const thisYear = today.getFullYear();

        const upcoming = [];
        for (const user of rows) {
            if (!user.birthdate) continue;
            const bDate = new Date(user.birthdate);
            if (isNaN(bDate.getTime())) continue;

            let nextBday = new Date(thisYear, bDate.getMonth(), bDate.getDate());
            if (nextBday < today) {
                nextBday = new Date(thisYear + 1, bDate.getMonth(), bDate.getDate());
            }

            const diffDays = Math.ceil((nextBday - today) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= days) {
                upcoming.push({
                    ...user,
                    user_id: user.userId,
                    days_until: diffDays,
                    age: thisYear - bDate.getFullYear()
                });
            }
        }

        return upcoming.sort((a, b) => a.days_until - b.days_until);
    } catch (error) {
        console.error('❌ Erreur getUpcomingBirthdays:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS XP & NIVEAUX
// ============================================

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
    try {
        const [existing] = await db.select()
            .from(schema.userXp)
            .where(eq(schema.userXp.userId, userId))
            .limit(1);

        if (existing) {
            return {
                ...existing,
                user_id: existing.userId,
                total_xp_earned: existing.totalXpEarned,
                messages_count: existing.messagesCount,
                voice_minutes: existing.voiceMinutes,
                events_participated: existing.eventsParticipated,
                last_message_xp: existing.lastMessageXp,
                created_at: existing.createdAt,
                updated_at: existing.updatedAt
            };
        }

        const [created] = await db.insert(schema.userXp)
            .values({
                userId,
                username,
                xp: 0,
                level: 1,
                totalXpEarned: 0,
                messagesCount: 0,
                voiceMinutes: 0,
                eventsParticipated: 0
            })
            .returning();

        console.log(`✨ Nouvel utilisateur XP créé: ${username}`);
        return {
            ...created,
            user_id: created.userId,
            total_xp_earned: created.totalXpEarned,
            messages_count: created.messagesCount,
            voice_minutes: created.voiceMinutes,
            events_participated: created.eventsParticipated,
            last_message_xp: created.lastMessageXp,
            created_at: created.createdAt,
            updated_at: created.updatedAt
        };
    } catch (error) {
        console.error('❌ Erreur getOrCreateUserXP:', error);
        throw error;
    }
}

async function addXP(userId, username, xpAmount, xpType = 'message', description = null, metadata = {}) {
    if (XP_CONFIG.ENABLED === false) {
        return null;
    }

    try {
        const user = await getOrCreateUserXP(userId, username);
        const xpToAdd = parseInt(xpAmount, 10);
        const currentXP = parseInt(user.xp, 10) || 0;
        const newTotalXP = currentXP + xpToAdd;
        const oldLevel = user.level;
        const newLevel = calculateLevel(newTotalXP);

        const isMessage = xpType === 'message';

        const [updatedUser] = await db.update(schema.userXp)
            .set({
                xp: newTotalXP,
                level: newLevel,
                totalXpEarned: sql`${schema.userXp.totalXpEarned} + ${xpToAdd}`,
                username: username,
                messagesCount: isMessage ? sql`${schema.userXp.messagesCount} + 1` : schema.userXp.messagesCount,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .where(eq(schema.userXp.userId, userId))
            .returning();

        await db.insert(schema.xpTransactions)
            .values({
                userId,
                username,
                xpAmount: xpToAdd,
                xpType,
                description,
                metadata: JSON.stringify(metadata)
            });

        console.log(`⭐ +${xpToAdd} XP pour ${username} (${xpType}) - Total: ${newTotalXP} XP`);

        return {
            user: updatedUser,
            leveledUp: newLevel > oldLevel,
            oldLevel: oldLevel,
            newLevel: newLevel,
            xpGained: xpToAdd
        };
    } catch (error) {
        console.error('❌ Erreur addXP:', error);
        throw error;
    }
}

async function addMessageXP(userId, username) {
    if (XP_CONFIG.ENABLED === false) {
        return { success: false, reason: 'disabled' };
    }
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

        await db.update(schema.userXp)
            .set({ lastMessageXp: sql`CURRENT_TIMESTAMP` })
            .where(eq(schema.userXp.userId, userId));

        const result = await addXP(userId, username, xpAmount, 'message', 'Message XP');
        return { success: true, ...result };
    } catch (error) {
        console.error('❌ Erreur addMessageXP:', error);
        return { success: false, reason: 'error' };
    }
}

async function startVoiceSession(userId, username, channelId, channelName) {
    if (XP_CONFIG.ENABLED === false) {
        return null;
    }
    try {
        const [session] = await db.insert(schema.voiceSessions)
            .values({
                userId,
                username,
                channelId,
                channelName,
                joinTime: sql`CURRENT_TIMESTAMP`
            })
            .returning();

        console.log(`🎤 ${username} a rejoint le vocal ${channelName}`);
        return session;
    } catch (error) {
        console.error('❌ Erreur startVoiceSession:', error);
        throw error;
    }
}

async function endVoiceSession(userId, username) {
    if (XP_CONFIG.ENABLED === false) {
        return null;
    }

    try {
        const [session] = await db.select()
            .from(schema.voiceSessions)
            .where(and(
                eq(schema.voiceSessions.userId, userId),
                sql`${schema.voiceSessions.leaveTime} IS NULL`
            ))
            .orderBy(desc(schema.voiceSessions.joinTime))
            .limit(1);

        if (!session) return null;

        const joinTime = new Date(session.joinTime);
        const leaveTime = new Date();
        const durationMinutes = Math.floor((leaveTime - joinTime) / (1000 * 60));
        const xpEarned = durationMinutes * XP_CONFIG.VOICE_XP.PER_MINUTE;

        await db.update(schema.voiceSessions)
            .set({
                leaveTime: toISOStringSafe(leaveTime, new Date().toISOString()),
                durationMinutes: durationMinutes,
                xpEarned: xpEarned
            })
            .where(eq(schema.voiceSessions.id, session.id));

        if (durationMinutes >= XP_CONFIG.VOICE_XP.MIN_DURATION && xpEarned > 0) {
            await addXP(
                userId,
                username,
                xpEarned,
                'voice',
                `${durationMinutes} minutes en vocal`,
                { channel: session.channelName, duration: durationMinutes }
            );

            await db.update(schema.userXp)
                .set({ voiceMinutes: sql`${schema.userXp.voiceMinutes} + ${durationMinutes}` })
                .where(eq(schema.userXp.userId, userId));
        }

        console.log(`🎤 ${username} a quitté le vocal - ${durationMinutes}min = ${xpEarned} XP`);

        return {
            duration: durationMinutes,
            xpEarned: xpEarned,
            channel: session.channelName
        };
    } catch (error) {
        console.error('❌ Erreur endVoiceSession:', error);
        throw error;
    }
}

async function getUserXPInfo(userId) {
    try {
        const user = await getOrCreateUserXP(userId, 'Unknown');
        const rank = await getUserRank(userId);
        const currentLevelXP = calculateXPForLevel(user.level);
        const nextLevelXP = calculateXPForLevel(user.level + 1);
        const xpInCurrentLevel = user.xp - currentLevelXP;
        const xpNeededForNextLevel = nextLevelXP - currentLevelXP;
        const progressPercent = Math.min(100, Math.max(0, Math.floor((xpInCurrentLevel / xpNeededForNextLevel) * 100)));

        return {
            ...user,
            user_id: user.userId,
            rank,
            currentLevelXP,
            nextLevelXP,
            xpInCurrentLevel,
            xpNeededForNextLevel,
            progressPercent
        };
    } catch (error) {
        console.error('❌ Erreur getUserXPInfo:', error);
        throw error;
    }
}

async function getLeaderboard(limit = 10) {
    try {
        const rows = await db.select()
            .from(schema.userXp)
            .orderBy(desc(schema.userXp.xp))
            .limit(limit);

        return rows.map((user, index) => ({
            ...user,
            user_id: user.userId,
            rank: index + 1
        }));
    } catch (error) {
        console.error('❌ Erreur getLeaderboard:', error);
        throw error;
    }
}

async function getUserRank(userId) {
    try {
        const [currentUser] = await db.select({ xp: schema.userXp.xp })
            .from(schema.userXp)
            .where(eq(schema.userXp.userId, userId))
            .limit(1);

        if (!currentUser) return null;

        const [higherUsers] = await db.select({ higherCount: count() })
            .from(schema.userXp)
            .where(gt(schema.userXp.xp, currentUser.xp));

        return (Number(higherUsers.higherCount) || 0) + 1;
    } catch (error) {
        console.error('❌ Erreur getUserRank:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS ÉVÉNEMENTS COMMUNAUTAIRES
// ============================================

async function createEvent(eventName, eventDescription, eventDate, xpReward, createdBy) {
    try {
        const [event] = await db.insert(schema.events)
            .values({
                eventName,
                eventDescription,
                eventDate: toISOStringSafe(eventDate, new Date().toISOString()),
                xpReward: parseInt(xpReward, 10) || 0,
                createdBy,
                isActive: 1
            })
            .returning();

        return event;
    } catch (error) {
        console.error('❌ Erreur createEvent:', error);
        throw error;
    }
}

async function addEventParticipant(eventId, userId, username) {
    try {
        const [event] = await db.select()
            .from(schema.events)
            .where(eq(schema.events.id, eventId))
            .limit(1);

        if (!event) throw new Error('Événement introuvable');

        const [participant] = await db.insert(schema.eventParticipants)
            .values({
                eventId,
                userId,
                username,
                xpEarned: event.xpReward || 0
            })
            .returning();

        if (event.xpReward && event.xpReward > 0) {
            await addXP(userId, username, event.xpReward, 'event', `Participation à: ${event.eventName}`);
            await db.update(schema.userXp)
                .set({ eventsParticipated: sql`${schema.userXp.eventsParticipated} + 1` })
                .where(eq(schema.userXp.userId, userId));
        }

        return participant;
    } catch (error) {
        console.error('❌ Erreur addEventParticipant:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS GESTION DES MEMBRES
// ============================================

async function registerNewMember(memberData) {
    try {
        const joinedAtStr = toISOStringSafe(memberData.joined_at, new Date().toISOString());
        const accountCreatedAtStr = toISOStringSafe(memberData.account_created_at, null);
        const rolesPayload = Array.isArray(memberData.roles) ? JSON.stringify(memberData.roles) : memberData.roles;

        const [existing] = await db.select()
            .from(schema.serverMembers)
            .where(eq(schema.serverMembers.userId, memberData.user_id))
            .limit(1);

        let member;
        if (existing) {
            [member] = await db.update(schema.serverMembers)
                .set({
                    username: memberData.username,
                    discriminator: memberData.discriminator,
                    tag: memberData.tag,
                    displayName: memberData.display_name,
                    avatarUrl: memberData.avatar_url,
                    joinedAt: joinedAtStr,
                    isBot: memberData.is_bot ? 1 : 0,
                    rejoinCount: sql`${schema.serverMembers.rejoinCount} + 1`,
                    leftAt: null,
                    roles: rolesPayload,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .where(eq(schema.serverMembers.userId, memberData.user_id))
                .returning();
        } else {
            [member] = await db.insert(schema.serverMembers)
                .values({
                    userId: memberData.user_id,
                    username: memberData.username,
                    discriminator: memberData.discriminator,
                    tag: memberData.tag,
                    displayName: memberData.display_name,
                    avatarUrl: memberData.avatar_url,
                    joinedAt: joinedAtStr,
                    accountCreatedAt: accountCreatedAtStr,
                    isBot: memberData.is_bot ? 1 : 0,
                    roles: rolesPayload
                })
                .returning();
        }

        await logMemberEvent(memberData.user_id, memberData.username, 'join', memberData.guild_id, {
            is_rejoin: !!existing,
            rejoin_count: member?.rejoinCount || (existing ? existing.rejoinCount + 1 : 0)
        });

        return member;
    } catch (error) {
        console.error('❌ Erreur registerNewMember:', error);
        throw error;
    }
}

async function logMemberEvent(userId, username, action, guildId, metadata = {}) {
    try {
        const [entry] = await db.insert(schema.memberHistory)
            .values({
                userId,
                username,
                action,
                guildId,
                metadata: JSON.stringify(metadata)
            })
            .returning();

        return entry;
    } catch (error) {
        console.error('❌ Erreur logMemberEvent:', error);
        throw error;
    }
}

async function updateMemberRoles(userId, roles) {
    try {
        const rolesPayload = Array.isArray(roles) ? JSON.stringify(roles) : roles;
        const [updated] = await db.update(schema.serverMembers)
            .set({
                roles: rolesPayload,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .where(eq(schema.serverMembers.userId, userId))
            .returning();

        return updated;
    } catch (error) {
        console.error('❌ Erreur updateMemberRoles:', error);
        throw error;
    }
}

async function markMemberLeft(userId, username, guildId) {
    try {
        const [updated] = await db.update(schema.serverMembers)
            .set({
                leftAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .where(eq(schema.serverMembers.userId, userId))
            .returning();

        await logMemberEvent(userId, username, 'leave', guildId);
        return updated;
    } catch (error) {
        console.error('❌ Erreur markMemberLeft:', error);
        throw error;
    }
}

async function getMemberInfo(userId) {
    try {
        const [member] = await db.select()
            .from(schema.serverMembers)
            .where(eq(schema.serverMembers.userId, userId))
            .limit(1);

        if (!member) return null;

        let parsedRoles = [];
        if (member.roles) {
            try {
                parsedRoles = JSON.parse(member.roles);
            } catch {
                parsedRoles = member.roles.split(',');
            }
        }

        return {
            ...member,
            user_id: member.userId,
            display_name: member.displayName,
            avatar_url: member.avatarUrl,
            joined_at: member.joinedAt,
            account_created_at: member.accountCreatedAt,
            is_bot: member.isBot,
            rejoin_count: member.rejoinCount,
            left_at: member.leftAt,
            roles: parsedRoles
        };
    } catch (error) {
        console.error('❌ Erreur getMemberInfo:', error);
        throw error;
    }
}

async function getRecentMembers(limit = 20) {
    try {
        const rows = await db.select()
            .from(schema.serverMembers)
            .orderBy(desc(schema.serverMembers.joinedAt))
            .limit(limit);

        return rows.map(m => {
            let parsedRoles = [];
            if (m.roles) {
                try {
                    parsedRoles = JSON.parse(m.roles);
                } catch {
                    parsedRoles = m.roles.split(',');
                }
            }
            return {
                ...m,
                user_id: m.userId,
                display_name: m.displayName,
                avatar_url: m.avatarUrl,
                joined_at: m.joinedAt,
                account_created_at: m.accountCreatedAt,
                is_bot: m.isBot,
                rejoin_count: m.rejoinCount,
                left_at: m.leftAt,
                roles: parsedRoles
            };
        });
    } catch (error) {
        console.error('❌ Erreur getRecentMembers:', error);
        throw error;
    }
}

async function getMemberHistory(userId, limit = 50) {
    try {
        const rows = await db.select()
            .from(schema.memberHistory)
            .where(eq(schema.memberHistory.userId, userId))
            .orderBy(desc(schema.memberHistory.createdAt))
            .limit(limit);

        return rows.map(h => ({
            ...h,
            user_id: h.userId,
            guild_id: h.guildId,
            metadata: h.metadata ? JSON.parse(h.metadata) : null
        }));
    } catch (error) {
        console.error('❌ Erreur getMemberHistory:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS CONFIG ACCUEIL (WELCOME)
// ============================================

async function getWelcomeConfig(guildId) {
    try {
        const [cfg] = await db.select()
            .from(schema.welcomeConfig)
            .where(eq(schema.welcomeConfig.guildId, guildId))
            .limit(1);

        if (!cfg) return null;

        let parsedRoles = [];
        if (cfg.autoRoles) {
            try {
                parsedRoles = JSON.parse(cfg.autoRoles);
            } catch {
                parsedRoles = cfg.autoRoles.split(',');
            }
        }

        return {
            ...cfg,
            guild_id: cfg.guildId,
            welcome_channel_id: cfg.welcomeChannelId,
            welcome_message: cfg.welcomeMessage,
            auto_roles: parsedRoles,
            is_enabled: cfg.isEnabled
        };
    } catch (error) {
        console.error('❌ Erreur getWelcomeConfig:', error);
        throw error;
    }
}

async function saveWelcomeConfig(guildId, welcomeChannelId, welcomeMessage, autoRoles = [], isEnabled = 1) {
    try {
        const rolesPayload = Array.isArray(autoRoles) ? JSON.stringify(autoRoles) : autoRoles;

        const [saved] = await db.insert(schema.welcomeConfig)
            .values({
                guildId,
                welcomeChannelId,
                welcomeMessage,
                autoRoles: rolesPayload,
                isEnabled: isEnabled ? 1 : 0,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.welcomeConfig.guildId,
                set: {
                    welcomeChannelId,
                    welcomeMessage,
                    autoRoles: rolesPayload,
                    isEnabled: isEnabled ? 1 : 0,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();

        return saved;
    } catch (error) {
        console.error('❌ Erreur saveWelcomeConfig:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS OPENAI / OPENROUTER MESSAGES
// ============================================

async function saveOpenAIMessage(data) {
    try {
        const [saved] = await db.insert(schema.openaimessages)
            .values({
                msgid: data.msgid,
                prompt: data.prompt,
                instruction: data.instruction || null,
                model: data.model || 'gpt-4o-mini',
                tokeninput: parseInt(data.tokeninput, 10) || 0,
                tokenoutput: parseInt(data.tokenoutput, 10) || 0,
                content: data.content,
                previousmsgid: data.previousMsgId || null,
                rawdata: data.rawData ? JSON.stringify(data.rawData) : null,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.openaimessages.msgid,
                set: {
                    prompt: data.prompt,
                    instruction: data.instruction || null,
                    model: data.model || 'gpt-4o-mini',
                    tokeninput: parseInt(data.tokeninput, 10) || 0,
                    tokenoutput: parseInt(data.tokenoutput, 10) || 0,
                    content: data.content,
                    previousmsgid: data.previousMsgId || null,
                    rawdata: data.rawData ? JSON.stringify(data.rawData) : null,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();

        return saved;
    } catch (error) {
        console.error('❌ Erreur saveOpenAIMessage:', error);
        throw error;
    }
}

async function getLastOpenAIMessageId() {
    try {
        const [latest] = await db.select({ msgid: schema.openaimessages.msgid })
            .from(schema.openaimessages)
            .orderBy(desc(schema.openaimessages.id))
            .limit(1);

        return latest ? latest.msgid : null;
    } catch (error) {
        console.error('❌ Erreur getLastOpenAIMessageId:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS GUILD MEMBERS & GROGNEMENT
// ============================================

async function addGuildMember(userId, username) {
    try {
        const [member] = await db.insert(schema.guildMembers)
            .values({ userId, username })
            .onConflictDoUpdate({
                target: schema.guildMembers.userId,
                set: { username }
            })
            .returning();

        return member;
    } catch (error) {
        console.error('❌ Erreur addGuildMember:', error);
        throw error;
    }
}

async function addGrognement(userId, username) {
    try {
        const [grog] = await db.insert(schema.grognement)
            .values({ userId, username })
            .onConflictDoUpdate({
                target: schema.grognement.userId,
                set: { username }
            })
            .returning();

        return grog;
    } catch (error) {
        console.error('❌ Erreur addGrognement:', error);
        throw error;
    }
}

async function getMemberForGrognement() {
    try {
        const grogMembers = await db.select().from(schema.grognement);
        if (grogMembers.length > 0) {
            return grogMembers[Math.floor(Math.random() * grogMembers.length)];
        }
        const guildMems = await db.select().from(schema.guildMembers);
        if (guildMems.length > 0) {
            return guildMems[Math.floor(Math.random() * guildMems.length)];
        }
        return null;
    } catch (error) {
        console.error('❌ Erreur getMemberForGrognement:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS CAPTCHA
// ============================================

async function createCaptcha(userId, username, guildId, question, answer, channelId, timeoutMinutes = 10) {
    try {
        const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
        const expiresAtStr = toISOStringSafe(expiresAt, new Date().toISOString());

        const [captcha] = await db.insert(schema.userCaptchas)
            .values({
                userId,
                username,
                guildId,
                question,
                answer,
                channelId,
                attempts: 0,
                isVerified: 0,
                expiresAt: expiresAtStr,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: [schema.userCaptchas.userId, schema.userCaptchas.guildId],
                set: {
                    username,
                    question,
                    answer,
                    channelId,
                    attempts: 0,
                    isVerified: 0,
                    expiresAt: expiresAtStr,
                    verifiedAt: null,
                    expiredAt: null,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();

        return captcha;
    } catch (error) {
        console.error('❌ Erreur createCaptcha:', error);
        throw error;
    }
}

async function getUserCaptcha(userId, guildId) {
    try {
        const [captcha] = await db.select()
            .from(schema.userCaptchas)
            .where(and(
                eq(schema.userCaptchas.userId, userId),
                eq(schema.userCaptchas.guildId, guildId)
            ))
            .limit(1);

        if (!captcha) return null;
        return {
            ...captcha,
            user_id: captcha.userId,
            guild_id: captcha.guildId,
            channel_id: captcha.channelId,
            is_verified: captcha.isVerified,
            expires_at: captcha.expiresAt,
            verified_at: captcha.verifiedAt,
            expired_at: captcha.expiredAt,
            created_at: captcha.createdAt,
            updated_at: captcha.updatedAt
        };
    } catch (error) {
        console.error('❌ Erreur getUserCaptcha:', error);
        throw error;
    }
}

async function verifyCaptchaAnswer(userId, guildId, userAnswer) {
    try {
        const captcha = await getUserCaptcha(userId, guildId);
        if (!captcha) {
            return { success: false, reason: 'not_found' };
        }

        if (captcha.is_verified) {
            return { success: true, reason: 'already_verified' };
        }

        const now = new Date();
        const expiresAt = new Date(captcha.expires_at);
        if (now > expiresAt) {
            await expireCaptcha(userId, guildId, false);
            return { success: false, reason: 'expired' };
        }

        const cleanUserAnswer = userAnswer.trim().toLowerCase();
        const cleanAnswer = captcha.answer.trim().toLowerCase();

        if (cleanUserAnswer === cleanAnswer) {
            await db.update(schema.userCaptchas)
                .set({
                    isVerified: 1,
                    verifiedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .where(and(
                    eq(schema.userCaptchas.userId, userId),
                    eq(schema.userCaptchas.guildId, guildId)
                ));

            return { success: true, attempts: captcha.attempts + 1 };
        } else {
            const newAttempts = captcha.attempts + 1;
            const maxAttempts = CAPTCHA_CONFIG.MAX_ATTEMPTS || 3;

            if (newAttempts >= maxAttempts) {
                await expireCaptcha(userId, guildId, false);
                return { success: false, reason: 'max_attempts_reached', attempts: newAttempts };
            } else {
                await db.update(schema.userCaptchas)
                    .set({
                        attempts: newAttempts,
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    })
                    .where(and(
                        eq(schema.userCaptchas.userId, userId),
                        eq(schema.userCaptchas.guildId, guildId)
                    ));

                return { success: false, reason: 'wrong_answer', attempts: newAttempts };
            }
        }
    } catch (error) {
        console.error('❌ Erreur verifyCaptchaAnswer:', error);
        throw error;
    }
}

async function expireCaptcha(userId, guildId, incrementAttempts = true) {
    try {
        const updates = {
            expiredAt: sql`CURRENT_TIMESTAMP`,
            updatedAt: sql`CURRENT_TIMESTAMP`
        };
        if (incrementAttempts) {
            updates.attempts = sql`${schema.userCaptchas.attempts} + 1`;
        }

        const [expired] = await db.update(schema.userCaptchas)
            .set(updates)
            .where(and(
                eq(schema.userCaptchas.userId, userId),
                eq(schema.userCaptchas.guildId, guildId)
            ))
            .returning();

        return expired;
    } catch (error) {
        console.error('❌ Erreur expireCaptcha:', error);
        throw error;
    }
}

async function isUserVerified(userId, guildId) {
    try {
        const captcha = await getUserCaptcha(userId, guildId);
        return captcha ? Boolean(captcha.is_verified) : false;
    } catch (error) {
        console.error('❌ Erreur isUserVerified:', error);
        return false;
    }
}

async function deleteCaptcha(userId, guildId) {
    try {
        await db.delete(schema.userCaptchas)
            .where(and(
                eq(schema.userCaptchas.userId, userId),
                eq(schema.userCaptchas.guildId, guildId)
            ));
        return true;
    } catch (error) {
        console.error('❌ Erreur deleteCaptcha:', error);
        throw error;
    }
}

async function saveCaptchaConfig(guildId, channelId = null, verifiedRoleId = null, timeoutMinutes = 10, maxAttempts = 3, isEnabled = 1) {
    try {
        const [saved] = await db.insert(schema.captchaConfig)
            .values({
                guildId,
                channelId,
                verifiedRoleId,
                timeoutMinutes,
                maxAttempts,
                isEnabled: isEnabled ? 1 : 0,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.captchaConfig.guildId,
                set: {
                    channelId,
                    verifiedRoleId,
                    timeoutMinutes,
                    maxAttempts,
                    isEnabled: isEnabled ? 1 : 0,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();

        return saved;
    } catch (error) {
        console.error('❌ Erreur saveCaptchaConfig:', error);
        throw error;
    }
}

async function getCaptchaConfig(guildId) {
    try {
        const [cfg] = await db.select()
            .from(schema.captchaConfig)
            .where(eq(schema.captchaConfig.guildId, guildId))
            .limit(1);

        if (!cfg) return null;
        return {
            ...cfg,
            guild_id: cfg.guildId,
            channel_id: cfg.channelId,
            verified_role_id: cfg.verifiedRoleId,
            timeout_minutes: cfg.timeoutMinutes,
            max_attempts: cfg.maxAttempts,
            is_enabled: cfg.isEnabled
        };
    } catch (error) {
        console.error('❌ Erreur getCaptchaConfig:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS BUMP (DISBOARD REMINDERS)
// ============================================

async function saveBump(guildId, channelId, userId = null, username = null) {
    try {
        const [bump] = await db.insert(schema.bumpLogs)
            .values({
                guildId,
                channelId,
                userId,
                username,
                bumpedAt: new Date().toISOString(),
                reminderSent: 0
            })
            .returning();

        return bump;
    } catch (error) {
        console.error('❌ Erreur saveBump:', error);
        throw error;
    }
}

async function getPendingBumpReminders() {
    try {
        const rows = await db.select()
            .from(schema.bumpLogs)
            .where(eq(schema.bumpLogs.reminderSent, 0))
            .orderBy(asc(schema.bumpLogs.bumpedAt));

        return rows.map(b => ({
            ...b,
            guild_id: b.guildId,
            channel_id: b.channelId,
            user_id: b.userId,
            bumped_at: b.bumpedAt,
            reminder_sent: b.reminderSent,
            reminder_sent_at: b.reminderSentAt
        }));
    } catch (error) {
        console.error('❌ Erreur getPendingBumpReminders:', error);
        throw error;
    }
}

async function markBumpReminderSent(bumpId) {
    try {
        const [updated] = await db.update(schema.bumpLogs)
            .set({
                reminderSent: 1,
                reminderSentAt: sql`CURRENT_TIMESTAMP`
            })
            .where(eq(schema.bumpLogs.id, bumpId))
            .returning();

        return updated;
    } catch (error) {
        console.error('❌ Erreur markBumpReminderSent:', error);
        throw error;
    }
}

async function getLastBump(guildId) {
    try {
        const [latest] = await db.select()
            .from(schema.bumpLogs)
            .where(eq(schema.bumpLogs.guildId, guildId))
            .orderBy(desc(schema.bumpLogs.bumpedAt))
            .limit(1);

        if (!latest) return null;
        return {
            ...latest,
            guild_id: latest.guildId,
            channel_id: latest.channelId,
            user_id: latest.userId,
            bumped_at: latest.bumpedAt
        };
    } catch (error) {
        console.error('❌ Erreur getLastBump:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS DUMP DISCORD
// ============================================

async function saveDumpUser(user) {
    if (!user || !user.id) return;
    try {
        await db.insert(schema.discordUsers)
            .values({
                userId: user.id,
                username: user.username || user.tag || 'Unknown',
                globalName: user.globalName || null,
                discriminator: user.discriminator || '0',
                bot: user.bot ? 1 : 0,
                avatarUrl: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : user.avatarURL || null,
                bannerUrl: user.bannerURL ? user.bannerURL({ dynamic: true }) : null,
                createdAt: toISOStringSafe(user.createdAt, new Date().toISOString()),
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.discordUsers.userId,
                set: {
                    username: user.username || user.tag || 'Unknown',
                    globalName: user.globalName || null,
                    discriminator: user.discriminator || '0',
                    bot: user.bot ? 1 : 0,
                    avatarUrl: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : user.avatarURL || null,
                    bannerUrl: user.bannerURL ? user.bannerURL({ dynamic: true }) : null,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            });
    } catch (e) {
        console.error(`❌ Erreur saveDumpUser(${user.id}):`, e.message);
    }
}

async function saveDumpChannel(channel) {
    if (!channel || !channel.id) return;
    try {
        await db.insert(schema.discordChannels)
            .values({
                channelId: channel.id,
                guildId: channel.guild?.id || channel.guildId || 'unknown',
                name: channel.name,
                type: String(channel.type),
                parentId: channel.parentId || channel.parent?.id || null,
                position: channel.position || 0,
                topic: channel.topic || null,
                isNsfw: channel.nsfw ? 1 : 0,
                createdAt: toISOStringSafe(channel.createdAt, new Date().toISOString()),
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.discordChannels.channelId,
                set: {
                    name: channel.name,
                    type: String(channel.type),
                    parentId: channel.parentId || channel.parent?.id || null,
                    position: channel.position || 0,
                    topic: channel.topic || null,
                    isNsfw: channel.nsfw ? 1 : 0,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            });
    } catch (e) {
        console.error(`❌ Erreur saveDumpChannel(${channel.id}):`, e.message);
    }
}

async function saveDumpThread(thread) {
    if (!thread || !thread.id) return;
    try {
        await db.insert(schema.discordThreads)
            .values({
                threadId: thread.id,
                guildId: thread.guildId || thread.guild?.id || 'unknown',
                parentId: thread.parentId || thread.parent?.id || 'unknown',
                name: thread.name,
                ownerId: thread.ownerId || null,
                archived: thread.archived ? 1 : 0,
                locked: thread.locked ? 1 : 0,
                messageCount: thread.messageCount || 0,
                memberCount: thread.memberCount || 0,
                createdAt: toISOStringSafe(thread.createdAt, new Date().toISOString()),
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.discordThreads.threadId,
                set: {
                    name: thread.name,
                    archived: thread.archived ? 1 : 0,
                    locked: thread.locked ? 1 : 0,
                    messageCount: thread.messageCount || 0,
                    memberCount: thread.memberCount || 0,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            });
    } catch (e) {
        console.error(`❌ Erreur saveDumpThread(${thread.id}):`, e.message);
    }
}

async function saveDumpMessagesBatch(messages) {
    if (!messages || messages.length === 0) return;
    try {
        for (const msg of messages) {
            const embeds = (msg.embeds || []).map(e => e.toJSON ? e.toJSON() : e);
            const attachments = Array.from(msg.attachments?.values() || []).map(a => ({
                id: a.id,
                name: a.name,
                url: a.url,
                contentType: a.contentType
            }));
            const reactions = Array.from(msg.reactions?.cache?.values() || []).map(r => ({
                emoji: r.emoji?.name,
                count: r.count
            }));

            await db.insert(schema.discordMessages)
                .values({
                    messageId: msg.id,
                    channelId: msg.channelId,
                    threadId: msg.channel?.isThread?.() ? msg.channel.id : null,
                    guildId: msg.guildId || msg.guild?.id || 'unknown',
                    authorId: msg.author?.id || 'unknown',
                    authorUsername: msg.author?.username || msg.author?.tag || 'Unknown',
                    content: msg.content || '',
                    pinned: msg.pinned ? 1 : 0,
                    embedsJson: JSON.stringify(embeds),
                    attachmentsJson: JSON.stringify(attachments),
                    reactionsJson: JSON.stringify(reactions),
                    createdAt: toISOStringSafe(msg.createdAt, new Date().toISOString()),
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: schema.discordMessages.messageId,
                    set: {
                        content: msg.content || '',
                        pinned: msg.pinned ? 1 : 0,
                        embedsJson: JSON.stringify(embeds),
                        attachmentsJson: JSON.stringify(attachments),
                        reactionsJson: JSON.stringify(reactions),
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                });
        }
    } catch (e) {
        console.error('❌ Erreur saveDumpMessagesBatch:', e.message);
    }
}

// ============================================
// FONCTIONS DU JEU COUNTER (ROUTE DE L'INFINI)
// ============================================

async function getCounterState(channelId) {
    try {
        const [st] = await db.select()
            .from(schema.counterState)
            .where(eq(schema.counterState.channelId, channelId))
            .limit(1);

        if (!st) return null;
        return {
            ...st,
            channel_id: st.channelId,
            current_number: st.currentNumber,
            last_user_id: st.lastUserId,
            updated_at: st.updatedAt
        };
    } catch (error) {
        console.error('❌ Erreur getCounterState:', error);
        throw error;
    }
}

async function updateCounterState(channelId, currentNumber, lastUserId) {
    try {
        const [updated] = await db.insert(schema.counterState)
            .values({
                channelId,
                currentNumber,
                lastUserId,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.counterState.channelId,
                set: {
                    currentNumber,
                    lastUserId,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();

        return {
            ...updated,
            channel_id: updated.channelId,
            current_number: updated.currentNumber,
            last_user_id: updated.lastUserId
        };
    } catch (error) {
        console.error('❌ Erreur updateCounterState:', error);
        throw error;
    }
}

// ============================================
// FONCTIONS DU JEU COUNTDOWN (COMPTE À REBOURS 900 -> 0)
// ============================================

async function getCountdownState(channelId) {
    try {
        const [st] = await db.select()
            .from(schema.countdownState)
            .where(eq(schema.countdownState.channelId, channelId))
            .limit(1);

        if (!st) return null;
        return {
            ...st,
            channel_id: st.channelId,
            current_number: st.currentNumber,
            is_trap_active: st.isTrapActive,
            trap_number: st.trapNumber,
            last_user_id: st.lastUserId,
            updated_at: st.updatedAt
        };
    } catch (error) {
        console.error('❌ Erreur getCountdownState:', error);
        throw error;
    }
}

async function updateCountdownState(channelId, currentNumber, isTrapActive = 0, trapNumber = null, lastUserId = null) {
    try {
        const [updated] = await db.insert(schema.countdownState)
            .values({
                channelId,
                currentNumber,
                isTrapActive: isTrapActive ? 1 : 0,
                trapNumber,
                lastUserId,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.countdownState.channelId,
                set: {
                    currentNumber,
                    isTrapActive: isTrapActive ? 1 : 0,
                    trapNumber,
                    lastUserId,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();

        return {
            ...updated,
            channel_id: updated.channelId,
            current_number: updated.currentNumber,
            is_trap_active: updated.isTrapActive,
            trap_number: updated.trapNumber,
            last_user_id: updated.lastUserId
        };
    } catch (error) {
        console.error('❌ Erreur updateCountdownState:', error);
        throw error;
    }
}

async function addCountdownScore(channelId, userId, username, points = 1) {
    try {
        const [score] = await db.insert(schema.countdownScores)
            .values({
                channelId,
                userId,
                username,
                score: points
            })
            .onConflictDoUpdate({
                target: [schema.countdownScores.channelId, schema.countdownScores.userId],
                set: {
                    username,
                    score: sql`${schema.countdownScores.score} + ${points}`
                }
            })
            .returning();

        return {
            ...score,
            channel_id: score.channelId,
            user_id: score.userId
        };
    } catch (error) {
        console.error('❌ Erreur addCountdownScore:', error);
        throw error;
    }
}

async function getCountdownScores(channelId, limit = 10) {
    try {
        const rows = await db.select()
            .from(schema.countdownScores)
            .where(eq(schema.countdownScores.channelId, channelId))
            .orderBy(desc(schema.countdownScores.score))
            .limit(limit);

        return rows.map(r => ({
            ...r,
            channel_id: r.channelId,
            user_id: r.userId
        }));
    } catch (error) {
        console.error('❌ Erreur getCountdownScores:', error);
        throw error;
    }
}

async function resetCountdownScores(channelId) {
    try {
        await db.delete(schema.countdownScores)
            .where(eq(schema.countdownScores.channelId, channelId));
        return true;
    } catch (error) {
        console.error('❌ Erreur resetCountdownScores:', error);
        throw error;
    }
}

// ============================================
// ÉTAT DU BOT ET SUIVI DE VERSION
// ============================================

async function getBotState(key) {
    try {
        const [state] = await db.select()
            .from(schema.botVersionState)
            .where(eq(schema.botVersionState.key, key))
            .limit(1);

        return state ? state.value : null;
    } catch (error) {
        console.error(`❌ Erreur getBotState(${key}):`, error);
        return null;
    }
}

async function setBotState(key, value) {
    try {
        await db.insert(schema.botVersionState)
            .values({
                key,
                value: String(value),
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.botVersionState.key,
                set: {
                    value: String(value),
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            });
        return true;
    } catch (error) {
        console.error(`❌ Erreur setBotState(${key}):`, error);
        return false;
    }
}

// ============================================
// ARCHIVAGE DES ÉVÉNEMENTS DISCORD & SYNCHRONISATION
// ============================================

async function archiveDiscordEvent(eventName, payload = {}) {
    try {
        const [archived] = await db.insert(schema.discordEventsArchive)
            .values({
                eventName,
                guildId: payload.guildId || payload.guild_id || null,
                targetId: payload.targetId || payload.target_id || null,
                userId: payload.userId || payload.user_id || null,
                username: payload.username || null,
                summary: payload.summary || null,
                dataJson: payload.data ? JSON.stringify(payload.data) : null
            })
            .returning();

        return archived;
    } catch (e) {
        console.error(`❌ Erreur archiveDiscordEvent(${eventName}):`, e.message);
    }
}

async function getDiscordEventsArchive(options = {}) {
    try {
        const limit = parseInt(options.limit, 10) || 50;
        const page = parseInt(options.page, 10) || 1;
        const offset = (page - 1) * limit;

        let query = db.select().from(schema.discordEventsArchive);

        if (options.eventName) {
            query = query.where(eq(schema.discordEventsArchive.eventName, options.eventName));
        }

        const rows = await query
            .orderBy(desc(schema.discordEventsArchive.createdAt))
            .limit(limit)
            .offset(offset);

        const [totalCountResult] = await db.select({ total: count() }).from(schema.discordEventsArchive);
        const total = Number(totalCountResult?.total) || 0;

        return {
            events: rows.map(r => {
                let parsedData = null;
                if (r.dataJson) {
                    try {
                        parsedData = JSON.parse(r.dataJson);
                    } catch {
                        parsedData = r.dataJson;
                    }
                }
                return {
                    id: r.id,
                    event_name: r.eventName,
                    guild_id: r.guildId,
                    target_id: r.targetId,
                    user_id: r.userId,
                    username: r.username,
                    summary: r.summary,
                    data: parsedData,
                    created_at: r.createdAt
                };
            }),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    } catch (e) {
        console.error('❌ Erreur getDiscordEventsArchive:', e.message);
        throw e;
    }
}

async function upsertDiscordChannel(channel) {
    if (!channel || !channel.id) return;
    try {
        await db.insert(schema.discordChannels)
            .values({
                channelId: channel.id,
                guildId: channel.guild?.id || channel.guildId || 'unknown',
                name: channel.name,
                type: String(channel.type),
                parentId: channel.parentId || channel.parent?.id || null,
                position: channel.position || 0,
                topic: channel.topic || null,
                isNsfw: channel.nsfw ? 1 : 0,
                createdAt: toISOStringSafe(channel.createdAt, new Date().toISOString()),
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.discordChannels.channelId,
                set: {
                    name: channel.name,
                    type: String(channel.type),
                    parentId: channel.parentId || channel.parent?.id || null,
                    position: channel.position || 0,
                    topic: channel.topic || null,
                    isNsfw: channel.nsfw ? 1 : 0,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            });
    } catch (e) {
        console.error(`❌ Erreur upsertDiscordChannel(${channel.id}):`, e.message);
    }
}

async function deleteDiscordChannel(channelId) {
    try {
        await db.delete(schema.discordChannels).where(eq(schema.discordChannels.channelId, channelId));
    } catch (e) {
        console.error(`❌ Erreur deleteDiscordChannel(${channelId}):`, e.message);
    }
}

async function upsertDiscordRole(role) {
    if (!role || !role.id) return;
    try {
        await db.insert(schema.discordRoles)
            .values({
                roleId: role.id,
                guildId: role.guild?.id || 'unknown',
                name: role.name,
                color: role.color || 0,
                hoist: role.hoist ? 1 : 0,
                position: role.position || 0,
                permissions: role.permissions?.bitfield?.toString() || '0',
                managed: role.managed ? 1 : 0,
                mentionable: role.mentionable ? 1 : 0,
                createdAt: toISOStringSafe(role.createdAt, new Date().toISOString()),
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.discordRoles.roleId,
                set: {
                    name: role.name,
                    color: role.color || 0,
                    hoist: role.hoist ? 1 : 0,
                    position: role.position || 0,
                    permissions: role.permissions?.bitfield?.toString() || '0',
                    managed: role.managed ? 1 : 0,
                    mentionable: role.mentionable ? 1 : 0,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            });
    } catch (e) {
        console.error(`❌ Erreur upsertDiscordRole(${role.id}):`, e.message);
    }
}

async function deleteDiscordRole(roleId) {
    try {
        await db.delete(schema.discordRoles).where(eq(schema.discordRoles.roleId, roleId));
    } catch (e) {
        console.error(`❌ Erreur deleteDiscordRole(${roleId}):`, e.message);
    }
}

async function upsertDiscordThread(thread) {
    if (!thread || !thread.id) return;
    try {
        await db.insert(schema.discordThreads)
            .values({
                threadId: thread.id,
                guildId: thread.guildId || thread.guild?.id || 'unknown',
                parentId: thread.parentId || thread.parent?.id || 'unknown',
                name: thread.name,
                ownerId: thread.ownerId || null,
                archived: thread.archived ? 1 : 0,
                locked: thread.locked ? 1 : 0,
                messageCount: thread.messageCount || 0,
                memberCount: thread.memberCount || 0,
                createdAt: toISOStringSafe(thread.createdAt, new Date().toISOString()),
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.discordThreads.threadId,
                set: {
                    name: thread.name,
                    archived: thread.archived ? 1 : 0,
                    locked: thread.locked ? 1 : 0,
                    messageCount: thread.messageCount || 0,
                    memberCount: thread.memberCount || 0,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            });
    } catch (e) {
        console.error(`❌ Erreur upsertDiscordThread(${thread.id}):`, e.message);
    }
}

async function deleteDiscordThread(threadId) {
    try {
        await db.delete(schema.discordThreads).where(eq(schema.discordThreads.threadId, threadId));
    } catch (e) {
        console.error(`❌ Erreur deleteDiscordThread(${threadId}):`, e.message);
    }
}

async function updateDiscordMessage(message) {
    if (!message || !message.id) return;
    try {
        const embeds = (message.embeds || []).map(e => e.toJSON ? e.toJSON() : e);
        const attachments = Array.from(message.attachments?.values() || []).map(a => ({
            id: a.id,
            name: a.name,
            url: a.url,
            contentType: a.contentType
        }));
        const reactions = Array.from(message.reactions?.cache?.values() || []).map(r => ({
            emoji: r.emoji?.name,
            count: r.count
        }));

        await db.insert(schema.discordMessages)
            .values({
                messageId: message.id,
                channelId: message.channelId,
                threadId: message.channel?.isThread?.() ? message.channel.id : null,
                guildId: message.guildId || 'unknown',
                authorId: message.author?.id || 'unknown',
                authorUsername: message.author?.username || message.author?.tag || 'Unknown',
                content: message.content || '',
                pinned: message.pinned ? 1 : 0,
                embedsJson: JSON.stringify(embeds),
                attachmentsJson: JSON.stringify(attachments),
                reactionsJson: JSON.stringify(reactions),
                createdAt: toISOStringSafe(message.createdAt, new Date().toISOString()),
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: schema.discordMessages.messageId,
                set: {
                    content: message.content || '',
                    pinned: message.pinned ? 1 : 0,
                    embedsJson: JSON.stringify(embeds),
                    attachmentsJson: JSON.stringify(attachments),
                    reactionsJson: JSON.stringify(reactions),
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            });
    } catch (e) {
        console.error(`❌ Erreur updateDiscordMessage(${message.id}):`, e.message);
    }
}

async function deleteDiscordMessage(messageId) {
    try {
        await db.delete(schema.discordMessages).where(eq(schema.discordMessages.messageId, messageId));
    } catch (e) {
        console.error(`❌ Erreur deleteDiscordMessage(${messageId}):`, e.message);
    }
}

// ============================================
// EXPORTS DU MODULE DATABASE
// ============================================
module.exports = {
    db,
    schema,
    dialect,
    isPostgres,
    isSqlite,
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
    saveBump,
    getPendingBumpReminders,
    markBumpReminderSent,
    getLastBump,
    saveDumpUser,
    saveDumpChannel,
    saveDumpThread,
    saveDumpMessagesBatch,
    getCounterState,
    updateCounterState,
    getCountdownState,
    updateCountdownState,
    addCountdownScore,
    getCountdownScores,
    resetCountdownScores,
    getBotState,
    setBotState,
    archiveDiscordEvent,
    getDiscordEventsArchive,
    upsertDiscordChannel,
    deleteDiscordChannel,
    upsertDiscordRole,
    deleteDiscordRole,
    upsertDiscordThread,
    deleteDiscordThread,
    updateDiscordMessage,
    deleteDiscordMessage
};