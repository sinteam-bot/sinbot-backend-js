const { Controller, Get, Post } = require('../../core/index.js');
const { CaptchaService } = require('./captcha.service.js');

class CaptchaController {
    static inject = [CaptchaService];

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

    async getChannelMessages(req) {
        const channelId = req?.params?.channelId || req?.query?.channel_id || req?.query?.channelId;
        const userId = req?.query?.user_id || req?.query?.userId;
        const guildId = req?.query?.guild_id || req?.query?.guildId;

        const data = await this.service.getChannelHistory(channelId, userId, guildId);
        return { success: true, data };
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

Controller('/api/captcha')(CaptchaController);
Get('')(CaptchaController.prototype, 'getLogs');
Get('/logs')(CaptchaController.prototype, 'getLogs');
Get('/messages')(CaptchaController.prototype, 'getChannelMessages');
Get('/messages/:channelId')(CaptchaController.prototype, 'getChannelMessages');
Get('/channel/:channelId')(CaptchaController.prototype, 'getChannelMessages');
Get('/status')(CaptchaController.prototype, 'getStatus');
Post('/verify')(CaptchaController.prototype, 'verifyUser');

module.exports = {
    CaptchaController
};

