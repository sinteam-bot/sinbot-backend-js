/**
 * src/modules/community_suggestions/controllers/suggestions.controller.js
 *
 * Contrôleur REST pour le module Suggestions.
 */

const { Controller, Get, Post, Patch } = require('../../../core/index.js');
const { SuggestionsService } = require('../services/suggestions.service.js');
const { SuggestionsRepository } = require('../services/suggestions.repository.js');
const { configService } = require('../../../config/index.js');
const logger = require('../../../utils/logger.js');

class SuggestionsController {
    static inject = [SuggestionsService, SuggestionsRepository];

    constructor(service, repo) {
        this.service = service;
        this.repo = repo;
    }

    async getStatus(req) {
        const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
        const conf = this.service.getConfig(guildId);
        const total = await this.repo.countSuggestions(guildId);
        const pending = await this.repo.countSuggestions(guildId, 'pending');
        const approved = await this.repo.countSuggestions(guildId, 'approved');
        const rejected = await this.repo.countSuggestions(guildId, 'rejected');
        const implemented = await this.repo.countSuggestions(guildId, 'implemented');

        return {
            success: true,
            data: {
                config: conf,
                stats: {
                    total,
                    pending,
                    approved,
                    rejected,
                    implemented
                }
            }
        };
    }

    async saveConfig(req) {
        try {
            const body = req.body || {};
            if (configService && typeof configService.saveModuleConfig === 'function') {
                await configService.saveModuleConfig('suggestions', body);
            }
            return {
                success: true,
                message: 'Configuration des suggestions mise à jour avec succès',
                data: body
            };
        } catch (error) {
            logger.error(`Erreur saveConfig Suggestions: ${error.message}`, 'SUGGESTIONS');
            return { success: false, error: error.message };
        }
    }

    async listSuggestions(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const status = req.query?.status || 'all';
            const userId = req.query?.userId || null;
            const limit = Math.min(Math.max(parseInt(req.query?.limit) || 50, 1), 100);
            const page = Math.max(parseInt(req.query?.page) || 1, 1);
            const offset = (page - 1) * limit;

            const list = await this.repo.listSuggestions(guildId, { status, userId, limit, offset });
            const total = await this.repo.countSuggestions(guildId, status);

            return {
                success: true,
                data: list,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error(`Erreur listSuggestions: ${error.message}`, 'SUGGESTIONS');
            return { success: false, error: error.message };
        }
    }

    async getSuggestion(req) {
        try {
            const id = req.params?.id;
            const suggestion = await this.repo.getSuggestion(id);
            if (!suggestion) {
                return { success: false, error: 'Suggestion introuvable' };
            }
            return { success: true, data: suggestion };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateStatus(req) {
        try {
            const id = req.params?.id;
            const { status, reason } = req.body || {};
            const client = req.app?.get('discordClient') || req.client || null;
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';

            const res = await this.service.updateStatus(
                guildId,
                id,
                status,
                req.user || { id: 'api_admin' },
                reason,
                { client }
            );

            return res;
        } catch (error) {
            logger.error(`Erreur updateStatus: ${error.message}`, 'SUGGESTIONS');
            return { success: false, error: error.message };
        }
    }
}

Controller('/api/suggestions')(SuggestionsController);
Get('')(SuggestionsController.prototype, 'listSuggestions');
Get('/status')(SuggestionsController.prototype, 'getStatus');
Post('/config')(SuggestionsController.prototype, 'saveConfig');
Get('/:id')(SuggestionsController.prototype, 'getSuggestion');
Patch('/:id/status')(SuggestionsController.prototype, 'updateStatus');

module.exports = { SuggestionsController };
