const { Controller, Get, Post } = require('../../core/index.js');
const { DailyMessageService } = require('./daily-message.service.js');

class DailyMessageController {
    static inject = [DailyMessageService];

    constructor(service) {
        this.service = service;
    }

    async getStatus(req) {
        const data = await this.service.getStatus();
        return { success: true, data };
    }

    async generateDraft(req) {
        const result = await this.service.generateDailyMessageContent();
        return {
            success: true,
            data: {
                text: result.text,
                model: result.model,
                date: result.date
            }
        };
    }

    async sendPreview(req) {
        const client = req.app?.get('discordClient');
        if (!client) {
            return { success: false, error: 'Client Discord non disponible' };
        }
        const message = await this.service.sendPreview(client);
        return { success: true, messageId: message?.id };
    }

    async publishNow(req) {
        const client = req.app?.get('discordClient');
        if (!client) {
            return { success: false, error: 'Client Discord non disponible' };
        }
        const text = req.body?.text;
        const draft = text ? { text, model: 'manual' } : await this.service.generateDailyMessageContent();
        await this.service.executePublication(client, draft);
        return { success: true, message: 'Message du jour publié avec succès.' };
    }
}

Controller('/api/daily-message')(DailyMessageController);
Get('')(DailyMessageController.prototype, 'getStatus');
Get('/status')(DailyMessageController.prototype, 'getStatus');
Post('/generate')(DailyMessageController.prototype, 'generateDraft');
Post('/preview')(DailyMessageController.prototype, 'sendPreview');
Post('/publish')(DailyMessageController.prototype, 'publishNow');

module.exports = {
    DailyMessageController
};
