const { Controller, Get, Post } = require('../../core/index.js');
const { CaptchaService } = require('./captcha.service.js');
const webChallenge = require('./challenges/web.js');

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

    /**
     * Endpoint appelé par la page HTML /verify/:token quand le membre
     * a résolu le hCaptcha. Vérifie la réponse côté hCaptcha et
     * renvoie un validationToken signé.
     *
     * POST /api/captcha/web-validate
     * Body : { hcaptchaResponse, initialToken }
     */
    async webValidate(req) {
        const { hcaptchaResponse, initialToken } = req?.body || {};
        if (!hcaptchaResponse || !initialToken) {
            return { success: false, error: 'hcaptchaResponse et initialToken requis.' };
        }
        const remoteIp = req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || null;
        const result = await webChallenge.verifyHcaptchaAndIssueToken({ hcaptchaResponse, initialToken, remoteIp });
        if (!result.ok) {
            return { success: false, error: result.error, errors: result.errors };
        }
        return { success: true, validationToken: result.validationToken, jti: result.jti };
    }

    /**
     * Endpoint appelé par le bouton "J'ai validé" dans Discord.
     * Le membre soumet le validationToken reçu après hCaptcha.
     * Si OK, le service marque le captcha comme vérifié, attribue le
     * rôle vérifié et déclenche le welcome.
     *
     * POST /api/captcha/web-confirm
     * Body : { validationToken, guildId, channelId }
     */
    async webConfirm(req) {
        const { validationToken, guildId, channelId } = req?.body || {};
        if (!validationToken || !guildId || !channelId) {
            return { success: false, error: 'validationToken, guildId et channelId requis.' };
        }
        const client = req?.app?.get?.('discordClient');
        return await this.service.confirmWebCaptcha({ validationToken, guildId, channelId, client });
    }

    async listChallengeTypes() {
        const { listAvailable } = require('./challenges/index.js');
        return { success: true, data: listAvailable() };
    }
}

Controller('/api/captcha')(CaptchaController);
Get('')(CaptchaController.prototype, 'getLogs');
Get('/logs')(CaptchaController.prototype, 'getLogs');
Get('/messages')(CaptchaController.prototype, 'getChannelMessages');
Get('/messages/:channelId')(CaptchaController.prototype, 'getChannelMessages');
Get('/channel/:channelId')(CaptchaController.prototype, 'getChannelMessages');
Get('/status')(CaptchaController.prototype, 'getStatus');
Get('/types')(CaptchaController.prototype, 'listChallengeTypes');
Post('/verify')(CaptchaController.prototype, 'verifyUser');
Post('/web-validate')(CaptchaController.prototype, 'webValidate');
Post('/web-confirm')(CaptchaController.prototype, 'webConfirm');

module.exports = {
    CaptchaController
};

