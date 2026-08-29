const { Controller, Get, Post } = require('../../core/index.js');
const { WelcomeService } = require('./welcome.service.js');

class WelcomeController {
    static inject = [WelcomeService];

    constructor(service) {
        this.service = service;
    }

    async getStatus(req) {
        const data = this.service.getStatus();
        return { success: true, data };
    }

    async testWelcome(req) {
        const client = req.app?.get('discordClient');
        const userId = req.body?.userId;
        const guildId = req.body?.guildId;

        if (!client || !userId || !guildId) {
            return { success: false, error: 'client, userId et guildId requis' };
        }

        try {
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            await this.service.handleWelcome(member);
            return { success: true, message: `Accueil testé pour ${member.user.tag}` };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/welcome')(WelcomeController);
Get('')(WelcomeController.prototype, 'getStatus');
Get('/status')(WelcomeController.prototype, 'getStatus');
Post('/test')(WelcomeController.prototype, 'testWelcome');

module.exports = {
    WelcomeController
};
