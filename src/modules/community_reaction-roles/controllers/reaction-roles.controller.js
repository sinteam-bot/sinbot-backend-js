/**
 * ReactionRolesController — endpoints REST
 *
 *   GET    /api/reaction-roles?guild_id=&message_id=
 *   POST   /api/reaction-roles          : body { guildId, channelId, messageId, emoji, roleId, description }
 *   PATCH  /api/reaction-roles/:id      : body { description?, mode? }
 *   DELETE /api/reaction-roles/:id
 *   POST   /api/reaction-roles/bulk     : body { guildId, messageId } -> supprime tout pour ce message
 */

const { Controller, Get, Post, Patch, Delete } = require('../../../core/index.js');
const { ReactionRolesService } = require('../services/reaction-roles.service.js');

class ReactionRolesController {
    static inject = [ReactionRolesService];

    constructor(service) {
        this.service = service;
    }

    async list(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const messageId = req.query.message_id;
            const limit = Math.min(parseInt(req.query.limit) || 50, 200);
            const offset = Math.max(parseInt(req.query.offset) || 0, 0);

            let data;
            if (messageId) {
                data = await this.service.listByMessage(guildId, messageId);
            } else {
                data = await this.service.list(guildId, limit, offset);
            }
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const r = await this.service.create({
                guildId: req.body.guildId || process.env.GUILD_ID,
                channelId: req.body.channelId,
                messageId: req.body.messageId,
                emoji: req.body.emoji,
                roleId: req.body.roleId,
                description: req.body.description,
                mode: req.body.mode,
                kind: req.body.kind,
                metadata: req.body.metadata
            });
            if (!r.ok) return { success: false, error: r.error, data: r.data || null };
            return { success: true, data: r.data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createButton(req) {
        try {
            const r = await this.service.create({
                guildId: req.body.guildId || process.env.GUILD_ID,
                channelId: req.body.channelId,
                messageId: req.body.messageId,
                kind: 'button',
                roleId: req.body.roleId,
                metadata: {
                    label: req.body.label,
                    style: req.body.style || 'primary',
                    emoji: req.body.emoji,
                    action: req.body.action || 'toggle_role',
                    url: req.body.url,
                    customIdSuffix: req.body.customIdSuffix
                }
            });
            if (!r.ok) return { success: false, error: r.error };
            return { success: true, data: r.data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createSelect(req) {
        try {
            const r = await this.service.create({
                guildId: req.body.guildId || process.env.GUILD_ID,
                channelId: req.body.channelId,
                messageId: req.body.messageId,
                kind: 'select',
                roleId: req.body.options?.find(o => o.roleId)?.roleId,
                metadata: {
                    placeholder: req.body.placeholder,
                    minValues: req.body.minValues,
                    maxValues: req.body.maxValues,
                    options: req.body.options || []
                }
            });
            if (!r.ok) return { success: false, error: r.error };
            return { success: true, data: r.data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async update(req) {
        try {
            const r = await this.service.update(req.params.id, req.body || {});
            if (!r) return { success: false, error: 'Reaction-role introuvable' };
            return { success: true, data: r };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async delete(req) {
        try {
            await this.service.delete(req.params.id);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteBulk(req) {
        try {
            const guildId = req.body.guildId || process.env.GUILD_ID;
            const messageId = req.body.messageId;
            if (!guildId || !messageId) {
                return { success: false, error: 'guildId et messageId requis' };
            }
            await this.service.deleteByMessage(guildId, messageId);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/reaction-roles')(ReactionRolesController);
Get('/')(ReactionRolesController.prototype, 'list');
Post('/')(ReactionRolesController.prototype, 'create');
Post('/button')(ReactionRolesController.prototype, 'createButton');
Post('/select')(ReactionRolesController.prototype, 'createSelect');
Patch('/:id')(ReactionRolesController.prototype, 'update');
Delete('/:id')(ReactionRolesController.prototype, 'delete');
Post('/bulk')(ReactionRolesController.prototype, 'deleteBulk');

module.exports = { ReactionRolesController };
