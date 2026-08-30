/**
 * src/modules/community_modmail/controllers/modmail.controller.js
 *
 * Contrôleur REST pour la gestion du ModMail.
 */

const { Controller, Get, Post, Delete, container, getConfig } = require('../../../core/index.js');
const { ModMailService } = require('../services/modmail.service.js');

class ModMailController {
    static inject = [ModMailService];

    constructor(service) {
        this.service = service;
    }

    _getClient() {
        return container.has('Client') ? container.resolve('Client') : null;
    }

    _getConfig() {
        return getConfig().features?.modmail || {};
    }

    async listThreads(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const status = req.query?.status || null;
            const limit = parseInt(req.query?.limit, 10) || 50;
            const list = await this.service.listThreads(guildId, status, limit);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getThread(req) {
        try {
            const id = req.params?.id;
            const thread = await this.service.repo.getThreadById(id);
            if (!thread) return { success: false, error: 'Thread introuvable' };

            const messages = await this.service.getThreadMessages(id);
            return { success: true, data: { ...thread, messages } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async reply(req) {
        try {
            const channelId = req.params?.channelId;
            const { content, image_url, is_anonymous } = req.body || {};
            const staffUser = {
                id: req.body?.staff_id || 'web_admin',
                username: req.body?.staff_name || 'Dashboard Admin'
            };

            const client = this._getClient();
            const cfg = this._getConfig();

            return await this.service.replyToUser({
                channelId,
                staffUser,
                content,
                imageUrl: image_url,
                isAnonymous: Boolean(is_anonymous),
                client,
                config: cfg
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async close(req) {
        try {
            const channelId = req.params?.channelId;
            const reason = req.body?.reason || 'Clôturé depuis le dashboard';
            const closedBy = req.body?.closed_by || 'Dashboard Admin';
            const client = this._getClient();
            const cfg = this._getConfig();

            return await this.service.closeThread({
                channelId,
                closedBy,
                reason,
                client,
                config: cfg
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async listBans(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const bans = await this.service.listBans(guildId);
            return { success: true, data: bans };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async ban(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { user_id, reason, banned_by } = req.body || {};
            const res = await this.service.banUser(guildId, user_id, reason, banned_by || 'admin');
            return { success: true, data: res };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async unban(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.params?.userId || req.body?.user_id;
            await this.service.unbanUser(guildId, userId);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async listSnippets(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.listSnippets(guildId);
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async setSnippet(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { name, content, created_by } = req.body || {};
            const snip = await this.service.setSnippet({ guildId, name, content, createdBy: created_by || 'admin' });
            return { success: true, data: snip };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteSnippet(req) {
        try {
            const guildId = req.body?.guild_id || req.query?.guild_id || process.env.GUILD_ID || 'default';
            const name = req.params?.name;
            await this.service.deleteSnippet(guildId, name);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/modmail')(ModMailController);
Get('/threads')(ModMailController.prototype, 'listThreads');
Get('/threads/:id')(ModMailController.prototype, 'getThread');
Post('/threads/:channelId/reply')(ModMailController.prototype, 'reply');
Post('/threads/:channelId/close')(ModMailController.prototype, 'close');
Get('/bans')(ModMailController.prototype, 'listBans');
Post('/bans')(ModMailController.prototype, 'ban');
Delete('/bans/:userId')(ModMailController.prototype, 'unban');
Get('/snippets')(ModMailController.prototype, 'listSnippets');
Post('/snippets')(ModMailController.prototype, 'setSnippet');
Delete('/snippets/:name')(ModMailController.prototype, 'deleteSnippet');

module.exports = { ModMailController };
