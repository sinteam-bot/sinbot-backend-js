/**
 * src/modules/util_embed_builder/controllers/embed-builder.controller.js
 *
 * Contrôleur REST pour la gestion des custom embeds depuis le dashboard.
 */

const { Controller, Get, Post, Put, Delete, container } = require('../../../core/index.js');
const { EmbedBuilderService } = require('../services/embed-builder.service.js');
const logger = require('../../../utils/logger.js');

class EmbedBuilderController {
    static inject = [EmbedBuilderService];

    constructor(service) {
        this.service = service;
    }

    _getClient() {
        return container.has('Client') ? container.resolve('Client') : null;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.listEmbeds(guildId);
            return { success: true, data: list };
        } catch (err) {
            logger.error(`Erreur list Embeds: ${err.message}`, 'EMBED_BUILDER');
            return { success: false, error: err.message };
        }
    }

    async getOne(req) {
        try {
            const id = req.params?.id;
            const embed = await this.service.getEmbed(id);
            if (!embed) return { success: false, error: 'Embed introuvable' };
            return { success: true, data: embed };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { channel_id, embed } = req.body || {};
            const client = this._getClient();
            return await this.service.postEmbed({
                guildId,
                channelId: channel_id,
                embedData: embed,
                client
            });
        } catch (err) {
            logger.error(`Erreur create Embed: ${err.message}`, 'EMBED_BUILDER');
            return { success: false, error: err.message };
        }
    }

    async update(req) {
        try {
            const id = req.params?.id;
            const embedData = req.body || {};
            const client = this._getClient();
            return await this.service.editEmbed({
                id,
                embedData,
                client
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteEmbed(req) {
        try {
            const id = req.params?.id;
            const deleteMsg = req.query?.delete_message === 'true';
            const client = this._getClient();
            return await this.service.deleteEmbed({
                id,
                deleteDiscordMessage: deleteMsg,
                client
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/embeds')(EmbedBuilderController);
Get('')(EmbedBuilderController.prototype, 'list');
Get('/:id')(EmbedBuilderController.prototype, 'getOne');
Post('')(EmbedBuilderController.prototype, 'create');
Put('/:id')(EmbedBuilderController.prototype, 'update');
Delete('/:id')(EmbedBuilderController.prototype, 'deleteEmbed');

module.exports = { EmbedBuilderController };
