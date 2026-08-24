const { Controller, Get, Post } = require('../../core/index.js');
const { SecurityQuestionService } = require('./security-question.service.js');

class SecurityQuestionController {
    static inject = [SecurityQuestionService];

    constructor(service) {
        this.service = service;
    }

    async getLogs(req) {
        const data = await this.service.getCaptchaOverview();
        return { success: true, data };
    }

    async getStatus(req) {
        const userId = req?.query?.user_id;
        const guildId = req?.query?.guild_id;

        if (!userId || !guildId) {
            const overview = await this.service.getCaptchaOverview();
            return { success: true, data: overview.stats, config: overview.config };
        }

        const captcha = await this.service.repo.getUserCaptcha(userId, guildId);
        return {
            success: true,
            data: {
                isVerified: captcha?.is_verified === 1,
                attempts: captcha?.attempts || 0,
                expiresAt: captcha?.expires_at || null
            }
        };
    }

    async verifyUser(req) {
        const { userId, guildId } = req?.body || {};
        if (!userId || !guildId) {
            return { success: false, error: 'userId et guildId requis.' };
        }

        await this.service.repo.markVerified(userId, guildId);
        return { success: true, message: `Utilisateur ${userId} marqué comme vérifié avec succès.` };
    }
}

Controller('/api/security-question')(SecurityQuestionController);
Get('')(SecurityQuestionController.prototype, 'getLogs');
Get('/logs')(SecurityQuestionController.prototype, 'getLogs');
Get('/status')(SecurityQuestionController.prototype, 'getStatus');
Post('/verify')(SecurityQuestionController.prototype, 'verifyUser');

module.exports = {
    SecurityQuestionController
};
