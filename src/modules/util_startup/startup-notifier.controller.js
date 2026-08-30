const { Controller, Get, Post } = require('../../core/index.js');
const { StartupNotifierService } = require('./startup-notifier.service.js');

class StartupNotifierController {
    static inject = [StartupNotifierService];

    constructor(service) {
        this.service = service;
    }

    async getStatus(req = {}) {
        const guildId = req?.query?.guildId || req?.query?.guild_id || null;
        const data = await this.service.getStatus(guildId);
        return { success: true, data };
    }

    async triggerNotification(req) {
        const client = req.app?.get('discordClient');
        if (!client) {
            return { success: false, error: 'Client Discord non disponible' };
        }
        const guildId = req.body?.guildId || req.body?.guild_id || req.query?.guildId || null;
        const result = await this.service.sendStartupNotification(client, true, guildId);
        return { success: true, ...result };
    }
}

Controller('/api/notifier/startup')(StartupNotifierController);
Get('/status')(StartupNotifierController.prototype, 'getStatus');
Get('')(StartupNotifierController.prototype, 'getStatus');
Post('/trigger')(StartupNotifierController.prototype, 'triggerNotification');

module.exports = {
    StartupNotifierController
};
