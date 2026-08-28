/**
 * StickyRolesController — endpoints REST
 *
 *   GET    /api/sticky-roles?guild_id=&user_id=   : liste les rôles
 *   POST   /api/sticky-roles                       : body { guildId, userId, roleId }
 *   DELETE /api/sticky-roles?guild_id=&user_id=&role_id=
 *   DELETE /api/sticky-roles?guild_id=&user_id=   : clear all for user
 */

const { Controller, Get, Post, Delete } = require('../../../core/index.js');
const { StickyRolesService } = require('../services/sticky-roles.service.js');

class StickyRolesController {
    static inject = [StickyRolesService];

    constructor(service) {
        this.service = service;
    }

    async list(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const userId = req.query.user_id;
            if (!guildId || !userId) return { success: false, error: 'guild_id et user_id requis' };
            const data = await this.service.listForUser(guildId, userId);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async create(req) {
        try {
            const cfg = { max_per_user: req.body.max_per_user || 10 };
            const r = await this.service.addRole(
                req.body.guildId || process.env.GUILD_ID,
                req.body.userId,
                req.body.roleId,
                cfg
            );
            return { success: r.ok, data: r, error: r.error || null };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async delete(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const userId = req.query.user_id;
            const roleId = req.query.role_id;
            if (!guildId || !userId) return { success: false, error: 'guild_id et user_id requis' };
            if (roleId) {
                await this.service.removeRole(guildId, userId, roleId);
            } else {
                await this.service.clearForUser(guildId, userId);
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/sticky-roles')(StickyRolesController);
Get('/')(StickyRolesController.prototype, 'list');
Post('/')(StickyRolesController.prototype, 'create');
Delete('/')(StickyRolesController.prototype, 'delete');

module.exports = { StickyRolesController };
