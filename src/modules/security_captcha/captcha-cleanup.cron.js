/**
 * captcha-cleanup.cron.js — @Cron toutes les minutes
 *
 * Auto-kick des membres dont le captcha a expiré (aucune réponse dans
 * le délai `timeout_minutes` configuré) et suppression du salon dédié.
 *
 * Le ModuleManager._bindCronTasks lit les décorateurs @Cron pour
 * programmer ces handlers avec node-cron et passe le client Discord
 * en argument (cf. src/core/module-manager.js).
 */

const { Cron } = require('../../core/index.js');
const { CaptchaService } = require('./captcha.service.js');

class CaptchaCleanup {
    static inject = [CaptchaService];

    constructor(service) {
        this.service = service;
    }

    async tick(client) {
        try {
            const processed = await this.service.processExpiredCaptchas(client);
            if (processed > 0) {
                console.log(`⏰ [CaptchaCleanup] ${processed} captcha(s) expiré(s) traité(s)`);
            }
        } catch (err) {
            console.error('[CaptchaCleanup] tick failed:', err.message);
        }
    }
}

Cron('* * * * *', { timezone: 'Europe/Paris' })(CaptchaCleanup.prototype, 'tick');

module.exports = { CaptchaCleanup };