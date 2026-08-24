const { eq, and, desc, sql } = require('drizzle-orm');
const { db, schema } = require('../../db/index.js');
const { Repository } = require('../../core/index.js');

class SecurityQuestionRepository {
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
        const rows = await this.db.select()
            .from(this.schema.userCaptchas)
            .orderBy(desc(this.schema.userCaptchas.createdAt))
            .limit(limit);

        return rows.map(c => ({
            ...c,
            user_id: c.userId,
            guild_id: c.guildId,
            channel_id: c.channelId,
            is_verified: c.isVerified,
            created_at: c.createdAt,
            expires_at: c.expiresAt,
            verified_at: c.verifiedAt
        }));
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

Repository()(SecurityQuestionRepository);

module.exports = {
    SecurityQuestionRepository
};
