const { eq, and, desc, asc, sql } = require('drizzle-orm');
const { db, schema } = require('../../db/index.js');
const { Repository } = require('../../core/index.js');

class CaptchaRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    /**
     * Crée ou remplace un captcha pour un utilisateur
     */
    async createCaptcha(userId, username, guildId, question, answer, channelId, timeoutMinutes = 10) {
        const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();

        const [created] = await this.db.insert(this.schema.userCaptchas)
            .values({
                userId,
                username,
                guildId,
                question,
                answer,
                channelId,
                attempts: 0,
                isVerified: 0,
                expiresAt,
                createdAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: [this.schema.userCaptchas.userId, this.schema.userCaptchas.guildId],
                set: {
                    username,
                    question,
                    answer,
                    channelId,
                    attempts: 0,
                    isVerified: 0,
                    expiresAt,
                    verifiedAt: null,
                    createdAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();

        return created;
    }

    /**
     * Récupère le captcha d'un utilisateur pour une guild
     */
    async getUserCaptcha(userId, guildId) {
        const [captcha] = await this.db.select()
            .from(this.schema.userCaptchas)
            .where(
                and(
                    eq(this.schema.userCaptchas.userId, userId),
                    eq(this.schema.userCaptchas.guildId, guildId)
                )
            )
            .limit(1);

        if (!captcha) return null;

        return {
            ...captcha,
            user_id: captcha.userId,
            guild_id: captcha.guildId,
            channel_id: captcha.channelId,
            is_verified: captcha.isVerified,
            created_at: captcha.createdAt,
            expires_at: captcha.expiresAt,
            verified_at: captcha.verifiedAt
        };
    }

    /**
     * Récupère l'historique complet de tous les captchas
     */
    async getAllCaptchas(limit = 100) {
        const rows = await this.db.select({
            captcha: this.schema.userCaptchas,
            channelName: this.schema.discordChannels.name,
            channelDeletedAt: this.schema.discordChannels.deletedAt
        })
        .from(this.schema.userCaptchas)
        .leftJoin(
            this.schema.discordChannels,
            eq(this.schema.userCaptchas.channelId, this.schema.discordChannels.channelId)
        )
        .orderBy(desc(this.schema.userCaptchas.createdAt))
        .limit(limit);

        return rows.map(r => ({
            ...r.captcha,
            user_id: r.captcha.userId,
            guild_id: r.captcha.guildId,
            channel_id: r.captcha.channelId,
            channel_name: r.channelName || (r.captcha.username ? `captcha-${r.captcha.username.toLowerCase()}` : `captcha-${r.captcha.userId}`),
            channel_deleted_at: r.channelDeletedAt,
            is_verified: r.captcha.isVerified,
            created_at: r.captcha.createdAt,
            expires_at: r.captcha.expiresAt,
            verified_at: r.captcha.verifiedAt
        }));
    }

    /**
     * Récupère l'historique des messages et informations du salon Captcha
     */
    async getCaptchaChannelDetails(channelId, userId = null) {
        let channelInfo = null;

        if (channelId) {
            const [ch] = await this.db.select()
                .from(this.schema.discordChannels)
                .where(eq(this.schema.discordChannels.channelId, channelId))
                .limit(1);

            if (ch) {
                channelInfo = {
                    id: ch.channelId,
                    name: ch.name,
                    type: ch.type,
                    parentId: ch.parentId,
                    isDeleted: !!ch.deletedAt,
                    createdAt: ch.createdAt,
                    deletedAt: ch.deletedAt
                };
            }
        }

        // Récupérer les messages associés au salon ou à l'utilisateur
        let messages = [];
        if (channelId) {
            const msgRows = await this.db.select()
                .from(this.schema.discordMessages)
                .where(eq(this.schema.discordMessages.channelId, channelId))
                .orderBy(asc(this.schema.discordMessages.createdAt));

            messages = msgRows;
        }

        // Si aucun message trouvé par channelId et qu'un userId est fourni
        if (messages.length === 0 && userId) {
            const userMsgRows = await this.db.select()
                .from(this.schema.discordMessages)
                .where(eq(this.schema.discordMessages.authorId, userId))
                .orderBy(asc(this.schema.discordMessages.createdAt))
                .limit(25);

            if (userMsgRows.length > 0) {
                messages = userMsgRows;
            }
        }

        // Récupérer les événements archivés liés au salon ou à l'utilisateur
        let events = [];
        if (channelId || userId) {
            try {
                const eventConditions = [];
                if (channelId) {
                    eventConditions.push(eq(this.schema.discordEventsArchive.targetId, channelId));
                }
                if (userId) {
                    eventConditions.push(eq(this.schema.discordEventsArchive.userId, userId));
                }

                if (eventConditions.length > 0) {
                    const evtRows = await this.db.select()
                        .from(this.schema.discordEventsArchive)
                        .where(channelId && userId ? sql`${this.schema.discordEventsArchive.targetId} = ${channelId} OR ${this.schema.discordEventsArchive.userId} = ${userId}` : eventConditions[0])
                        .orderBy(asc(this.schema.discordEventsArchive.createdAt))
                        .limit(20);

                    events = evtRows;
                }
            } catch (e) {
                console.warn('[CaptchaRepo] Erreur select discordEventsArchive:', e.message);
            }
        }

        // Récupérer le captcha lié pour avoir le contexte (question/réponse)
        let captchaInfo = null;
        if (userId) {
            const [c] = await this.db.select()
                .from(this.schema.userCaptchas)
                .where(eq(this.schema.userCaptchas.userId, userId))
                .limit(1);
            if (c) captchaInfo = c;
        } else if (channelId) {
            const [c] = await this.db.select()
                .from(this.schema.userCaptchas)
                .where(eq(this.schema.userCaptchas.channelId, channelId))
                .limit(1);
            if (c) captchaInfo = c;
        }

        return {
            channel: channelInfo || {
                id: channelId,
                name: captchaInfo?.username ? `captcha-${captchaInfo.username.toLowerCase()}` : (channelId ? `salon-${channelId}` : 'salon-captcha'),
                isDeleted: true
            },
            captcha: captchaInfo ? {
                userId: captchaInfo.userId,
                username: captchaInfo.username,
                question: captchaInfo.question,
                answer: captchaInfo.answer,
                attempts: captchaInfo.attempts,
                isVerified: captchaInfo.isVerified === 1,
                createdAt: captchaInfo.createdAt,
                verifiedAt: captchaInfo.verifiedAt,
                expiresAt: captchaInfo.expiresAt
            } : null,
            messages: messages.map(m => {
                let embeds = null;
                let attachments = null;
                try {
                    if (m.embedsJson) embeds = JSON.parse(m.embedsJson);
                } catch (err) {
                    console.warn(`[CaptchaRepo] Erreur parse embedsJson pour msg ${m.messageId}:`, err.message);
                }
                try {
                    if (m.attachmentsJson) attachments = JSON.parse(m.attachmentsJson);
                } catch (err) {
                    console.warn(`[CaptchaRepo] Erreur parse attachmentsJson pour msg ${m.messageId}:`, err.message);
                }

                return {
                    id: m.messageId,
                    channelId: m.channelId,
                    authorId: m.authorId,
                    authorUsername: m.authorUsername,
                    content: m.content,
                    embeds,
                    attachments,
                    createdAt: m.createdAt,
                    deletedAt: m.deletedAt
                };
            }),
            events: events.map(e => ({
                id: e.id,
                eventName: e.eventName,
                summary: e.summary,
                userId: e.userId,
                username: e.username,
                createdAt: e.createdAt
            }))
        };
    }

    /**
     * Incrémente ou met à jour les tentatives
     */
    async updateAttempts(userId, guildId, attempts) {
        await this.db.update(this.schema.userCaptchas)
            .set({ attempts })
            .where(
                and(
                    eq(this.schema.userCaptchas.userId, userId),
                    eq(this.schema.userCaptchas.guildId, guildId)
                )
            );
    }

    /**
     * Marque un utilisateur comme vérifié avec succès
     */
    async markVerified(userId, guildId) {
        await this.db.update(this.schema.userCaptchas)
            .set({
                isVerified: 1,
                verifiedAt: sql`CURRENT_TIMESTAMP`
            })
            .where(
                and(
                    eq(this.schema.userCaptchas.userId, userId),
                    eq(this.schema.userCaptchas.guildId, guildId)
                )
            );
    }

    /**
     * Récupère les captchas expirés mais non vérifiés (à kicker)
     */
    async getExpiredCaptchas(now = new Date(), limit = 50) {
        const nowIso = now.toISOString();
        const rows = await this.db.select({
            captcha: this.schema.userCaptchas,
            channelName: this.schema.discordChannels.name,
            channelDeletedAt: this.schema.discordChannels.deletedAt
        })
        .from(this.schema.userCaptchas)
        .leftJoin(
            this.schema.discordChannels,
            eq(this.schema.userCaptchas.channelId, this.schema.discordChannels.channelId)
        )
        .where(
            and(
                eq(this.schema.userCaptchas.isVerified, 0),
                sql`${this.schema.userCaptchas.expiresAt} IS NOT NULL`,
                sql`${this.schema.userCaptchas.expiresAt} <= ${nowIso}`
            )
        )
        .orderBy(asc(this.schema.userCaptchas.expiresAt))
        .limit(limit);

        return rows.map(r => ({
            ...r.captcha,
            user_id: r.captcha.userId,
            guild_id: r.captcha.guildId,
            channel_id: r.captcha.channelId,
            channel_name: r.channelName,
            channel_deleted_at: r.channelDeletedAt,
            is_verified: r.captcha.isVerified,
            created_at: r.captcha.createdAt,
            expires_at: r.captcha.expiresAt,
            verified_at: r.captcha.verifiedAt
        }));
    }

    /**
     * Marque un captcha comme expiré (timestamp expiredAt)
     */
    async markExpired(userId, guildId) {
        await this.db.update(this.schema.userCaptchas)
            .set({
                expiredAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .where(
                and(
                    eq(this.schema.userCaptchas.userId, userId),
                    eq(this.schema.userCaptchas.guildId, guildId)
                )
            );
    }

    /**
     * Supprime un enregistrement de captcha
     */
    async deleteCaptcha(userId, guildId) {
        await this.db.delete(this.schema.userCaptchas)
            .where(
                and(
                    eq(this.schema.userCaptchas.userId, userId),
                    eq(this.schema.userCaptchas.guildId, guildId)
                )
            );
    }

    /**
     * Récupère la configuration en BDD d'une guild
     */
    async getConfig(guildId) {
        const [conf] = await this.db.select()
            .from(this.schema.captchaConfig)
            .where(eq(this.schema.captchaConfig.guildId, guildId))
            .limit(1);

        if (!conf) return null;

        return {
            ...conf,
            guild_id: conf.guildId,
            channel_id: conf.channelId,
            role_id: conf.roleId,
            timeout_minutes: conf.timeoutMinutes,
            max_attempts: conf.maxAttempts
        };
    }

    /**
     * Enregistre ou met à jour la configuration Captcha pour une guild
     */
    async saveConfig(guildId, channelId, roleId, timeoutMinutes = 10, maxAttempts = 3) {
        await this.db.insert(this.schema.captchaConfig)
            .values({
                guildId,
                channelId,
                roleId,
                timeoutMinutes,
                maxAttempts
            })
            .onConflictDoUpdate({
                target: this.schema.captchaConfig.guildId,
                set: {
                    channelId,
                    roleId,
                    timeoutMinutes,
                    maxAttempts
                }
            });
    }
}

Repository()(CaptchaRepository);

module.exports = {
    CaptchaRepository
};
