/**
 * src/modules/util_tags/controllers/tags.controller.js
 *
 * Contrôleur REST pour la gestion des tags depuis le dashboard.
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { TagsService } = require('../services/tags.service.js');
const logger = require('../../../utils/logger.js');

class TagsController {
    static inject = [TagsService];

    constructor(tagsService) {
        this.tagsService = tagsService;
    }

    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.tagsService.listTags(guildId);
            return { success: true, data: list };
        } catch (err) {
            logger.error(`Erreur list Tags: ${err.message}`, 'TAGS');
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { name, content } = req.body || {};
            const res = await this.tagsService.createTag({
                guildId,
                name,
                content,
                createdBy: req.user?.id || 'admin'
            });
            return res;
        } catch (err) {
            logger.error(`Erreur create Tag: ${err.message}`, 'TAGS');
            return { success: false, error: err.message };
        }
    }

    async deleteTag(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const name = req.params?.name;
            return await this.tagsService.deleteTag(guildId, name);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/tags')(TagsController);
Get('')(TagsController.prototype, 'list');
Post('')(TagsController.prototype, 'create');
Delete('/:name')(TagsController.prototype, 'deleteTag');

module.exports = { TagsController };
