const { Controller, Get, Post } = require('../../core/index.js');
const { BumpReminderService } = require('./bump-reminder.service.js');

class BumpReminderController {
    static inject = [BumpReminderService];

    constructor(service) {
        this.service = service;
    }

    async getStatus(req) {
        const guildId = req.query.guild_id || null;
        const data = await this.service.getBumpStatus(guildId);
        return { success: true, data };
    }

    async remindNow(req) {
        const client = req.app?.get('discordClient');
        if (!client) {
            return { success: false, error: 'Client Discord non disponible' };
        }

        const lastBump = await this.service.repo.getLastBump();
        if (!lastBump) {
            return { success: false, error: 'Aucun bump trouvé' };
        }

        await this.service.sendBumpReminder(client, lastBump);
        return { success: true, message: 'Rappel de bump envoyé avec succès.' };
    }
}

Controller('/api/bump')(BumpReminderController);
Get('')(BumpReminderController.prototype, 'getStatus');
Get('/status')(BumpReminderController.prototype, 'getStatus');
Post('/remind-now')(BumpReminderController.prototype, 'remindNow');

module.exports = {
    BumpReminderController
};
