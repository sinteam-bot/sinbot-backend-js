/**
 * src/modules/util_forms/controllers/forms.controller.js
 *
 * Contrôleur REST pour les formulaires.
 */

const { Controller, Get, Post, Delete, container } = require('../../../core/index.js');
const { FormsService } = require('../services/forms.service.js');

class FormsController {
    static inject = [FormsService];

    constructor(service) {
        this.service = service;
    }

    _getClient() {
        return container.has('Client') ? container.resolve('Client') : null;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.listForms(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getOne(req) {
        try {
            const form = await this.service.getForm(req.params?.id);
            if (!form) return { success: false, error: 'Formulaire introuvable' };
            return { success: true, data: form };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { name, title, description, channel_id, questions } = req.body || {};
            return await this.service.createForm({
                guildId,
                name,
                title,
                description,
                channelId: channel_id,
                questions
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteForm(req) {
        try {
            return await this.service.deleteForm(req.params?.id);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async listSubmissions(req) {
        try {
            const submissions = await this.service.listSubmissions(req.params?.id);
            return { success: true, data: submissions };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async submit(req) {
        try {
            const formId = req.params?.id;
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.body?.user_id || 'api_user';
            const answers = req.body?.answers || {};
            const client = this._getClient();

            return await this.service.submitForm({
                formId,
                guildId,
                userId,
                answers,
                client
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/forms')(FormsController);
Get('')(FormsController.prototype, 'list');
Get('/:id')(FormsController.prototype, 'getOne');
Post('')(FormsController.prototype, 'create');
Delete('/:id')(FormsController.prototype, 'deleteForm');
Get('/:id/submissions')(FormsController.prototype, 'listSubmissions');
Post('/:id/submissions')(FormsController.prototype, 'submit');

module.exports = { FormsController };
