const { eq, and, desc, sql } = require('drizzle-orm');
const { db, schema } = require('../../db/index.js');
const { Repository } = require('../../core/index.js');
const { toISOStringSafe } = require('../../utils/dateUtils.js');

class XPLevelRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    /**
     * Récupère les données d'XP d'un utilisateur
     */
    async getUserXP(userId) {
        const [user] = await this.db.select()
            .from(this.schema.userXp)
            .where(eq(this.schema.userXp.userId, userId))
            .limit(1);

        if (!user) return null;

        return {
            ...user,
            user_id: user.userId,
            total_xp: user.xp,
            level: user.level,
            voice_minutes: user.voiceMinutes,
            messages_count: user.messagesCount,
            last_message_xp: user.lastMessageXp,
            created_at: user.createdAt,
            updated_at: user.updatedAt
        };
    }

    /**
     * Récupère ou initialise les données XP d'un utilisateur
     */
    async getOrCreateUserXP(userId, username) {
        let user = await this.getUserXP(userId);
        if (!user) {
            const [created] = await this.db.insert(this.schema.userXp)
                .values({
                    userId,
                    username,
                    xp: 0,
                    level: 0,
                    totalXpEarned: 0,
                    messagesCount: 0,
                    voiceMinutes: 0
                })
                .onConflictDoNothing()
                .returning();

            if (created) {
                user = {
                    ...created,
                    user_id: created.userId,
                    total_xp: created.xp,
                    voice_minutes: created.voiceMinutes,
                    messages_count: created.messagesCount,
                    last_message_xp: created.lastMessageXp
                };
            } else {
                user = await this.getUserXP(userId);
            }
        }
        return user;
    }

    /**
     * Met à jour le total d'XP, le niveau et le compteur de messages
     */
    async updateUserXP(userId, username, totalXp, level, incrementMessage = false) {
        const setValues = {
            username,
            xp: totalXp,
            totalXpEarned: totalXp,
            level,
            updatedAt: sql`CURRENT_TIMESTAMP`
        };

        if (incrementMessage) {
            setValues.messagesCount = sql`${this.schema.userXp.messagesCount} + 1`;
            setValues.lastMessageXp = sql`CURRENT_TIMESTAMP`;
        }

        const [updated] = await this.db.update(this.schema.userXp)
            .set(setValues)
            .where(eq(this.schema.userXp.userId, userId))
            .returning();

        return {
            ...updated,
            user_id: updated.userId,
            total_xp: updated.xp,
            voice_minutes: updated.voiceMinutes
        };
    }

    /**
     * Enregistre une transaction d'XP
     */
    async logTransaction(userId, username, xpAmount, xpType, description, metadata = {}) {
        await this.db.insert(this.schema.xpTransactions)
            .values({
                userId,
                username,
                xpAmount,
                xpType,
                description,
                metadata: JSON.stringify(metadata)
            });
    }

    /**
     * Récupère le classement des membres par XP
     */
    async getLeaderboard(limit = 100) {
        const rows = await this.db.select()
            .from(this.schema.userXp)
            .orderBy(desc(this.schema.userXp.xp))
            .limit(limit);

        return rows.map((u, index) => ({
            rank: index + 1,
            userId: u.userId,
            username: u.username,
            totalXp: u.xp,
            level: u.level,
            messagesCount: u.messagesCount,
            voiceMinutes: u.voiceMinutes,
            updatedAt: u.updatedAt
        }));
    }

    /**
     * Démarre une session vocale
     */
    async startVoiceSession(userId, username, channelId, channelName) {
        const [session] = await this.db.insert(this.schema.voiceSessions)
            .values({
                userId,
                username,
                channelId,
                channelName,
                joinTime: sql`CURRENT_TIMESTAMP`
            })
            .returning();

        return session;
    }

    /**
     * Termine la session vocale active
     */
    async endVoiceSession(userId) {
        const [session] = await this.db.select()
            .from(this.schema.voiceSessions)
            .where(and(
                eq(this.schema.voiceSessions.userId, userId),
                sql`${this.schema.voiceSessions.leaveTime} IS NULL`
            ))
            .orderBy(desc(this.schema.voiceSessions.joinTime))
            .limit(1);

        if (!session) return null;

        const joinTime = new Date(session.joinTime);
        const leaveTime = new Date();
        const durationMinutes = Math.max(1, Math.floor((leaveTime.getTime() - joinTime.getTime()) / (1000 * 60)));

        await this.db.update(this.schema.voiceSessions)
            .set({
                leaveTime: toISOStringSafe(leaveTime),
                durationMinutes: durationMinutes
            })
            .where(eq(this.schema.voiceSessions.id, session.id));

        return {
            ...session,
            durationMinutes
        };
    }

    /**
     * Remet à zéro l'XP d'un utilisateur
     */
    async resetUserXP(userId) {
        const { sql: drizzleSql } = require('drizzle-orm');
        const [updated] = await this.db.update(this.schema.userXp)
            .set({
                xp: 0,
                level: 0,
                totalXpEarned: 0,
                messagesCount: 0,
                voiceMinutes: 0,
                lastMessageXp: null,
                updatedAt: drizzleSql`CURRENT_TIMESTAMP`
            })
            .where(eq(this.schema.userXp.userId, userId))
            .returning();
        return { reset: !!updated, userId };
    }

    /**
     * Récupère les rôles de récompense configurés par niveau
     */
    async getRewardRoles(guildId = null) {
        const { config: globalConfig, getConfig: getGlobalConfig } = require('../../config/index.js');
        const fullConfig = getGlobalConfig ? getGlobalConfig() : globalConfig;
        const x = fullConfig.xp || {};
        const levelRoles = x.level_roles || x.LEVEL_ROLES || {};

        const results = [];
        for (const [levelStr, roleIdentifier] of Object.entries(levelRoles)) {
            const level = parseInt(levelStr, 10);
            if (!isNaN(level) && roleIdentifier) {
                results.push({
                    levelRequired: level,
                    roleId: String(roleIdentifier),
                    roleName: typeof roleIdentifier === 'string' ? roleIdentifier : null
                });
            }
        }

        // Trier par niveau croissant
        results.sort((a, b) => a.levelRequired - b.levelRequired);
        return results;
    }
}

Repository()(XPLevelRepository);

module.exports = {
    XPLevelRepository
};
