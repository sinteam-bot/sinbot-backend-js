/**
 * cards.controller.js — REST API pour le CardRenderer
 *
 *   GET /api/cards/render?template=welcome&username=alice
 *   GET /api/cards/templates
 *   DELETE /api/cards/cache?guild_id=&user_id=&template=
 *
 * Utilisable par le front (preview) et par n8n (automatisation).
 */

const { Controller, Get, Delete } = require('../../../core/index.js');
const { CardRendererService } = require('../services/card-renderer.service.js');
const { WelcomeCardService } = require('../services/welcome-card.service.js');

class CardsController {
    static inject = [CardRendererService, WelcomeCardService];

    constructor(renderer, welcomeCard) {
        this.renderer = renderer;
        this.welcomeCard = welcomeCard;
    }

    async listTemplates(req) {
        return { success: true, data: this.renderer.listTemplates() };
    }

    async render(req) {
        try {
            const template = req.query.template;
            if (!template) return { success: false, error: 'template requis' };

            const payload = { ...req.query };
            delete payload.template;
            delete payload.guild_id;
            delete payload.width;
            delete payload.height;

            const options = {};
            if (req.query.width) options.width = parseInt(req.query.width);
            if (req.query.height) options.height = parseInt(req.query.height);

            const useCache = req.query.cache !== 'false';
            const guildId = req.query.guild_id || 'preview';
            const userId = req.query.user_id || 'preview';

            let svg;
            if (useCache && req.query.guild_id && req.query.user_id) {
                svg = await this.welcomeCard.render({ guildId, userId, template, payload, options });
            } else {
                svg = this.renderer.render(template, payload, options);
            }
            return { success: true, data: { template, svg, format: 'svg' } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getSvg(req) {
        try {
            const template = req.query.template;
            const guildId = req.query.guild_id || 'preview';
            const userId = req.query.user_id || 'preview';
            const payload = { ...req.query };
            delete payload.template;
            delete payload.guild_id;
            delete payload.user_id;

            const options = {};
            if (req.query.width) options.width = parseInt(req.query.width);
            if (req.query.height) options.height = parseInt(req.query.height);

            const svg = await this.welcomeCard.render({ guildId, userId, template, payload, options });
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(svg);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async clearCache(req) {
        try {
            const result = await this.welcomeCard.clearCache({
                guildId: req.query.guild_id,
                userId: req.query.user_id,
                template: req.query.template
            });
            return { success: true, data: result };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/cards')(CardsController);
Get('/templates')(CardsController.prototype, 'listTemplates');
Get('/render')(CardsController.prototype, 'render');
Get('/svg')(CardsController.prototype, 'getSvg');
Delete('/cache')(CardsController.prototype, 'clearCache');

module.exports = { CardsController };
