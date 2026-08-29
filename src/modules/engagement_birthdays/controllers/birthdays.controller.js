/**
 * BirthdaysController — endpoints REST pour la feature Birthdays
 *
 *   GET    /api/birthdays/settings?guild_id=
 *   PATCH  /api/birthdays/settings
 *   GET    /api/birthdays/today?guild_id=
 *   GET    /api/birthdays/upcoming?guild_id=&days=7
 *   GET    /api/birthdays/user/:userId?guild_id=
 *   PUT    /api/birthdays/user/:userId
 *   DELETE /api/birthdays/user/:userId
 *   POST   /api/birthdays/user/:userId/visibility
 *   GET    /api/birthdays/history?guild_id=&user_id=
 */

const { Controller, Get, Post, Put, Patch, Delete } = require('../../../core/index.js');
const { BirthdayService } = require('../services/birthday.service.js');

function getEffectiveGuildId(req) {
    let defaultGuildId = process.env.GUILD_ID || null;
    try {
        const { container } = require('../../../core/index.js');
        const client = container.has('Client') ? container.resolve('Client') : null;
        if (!defaultGuildId && client?.guilds?.cache?.size > 0) {
            defaultGuildId = client.guilds.cache.first().id;
        }
    } catch (err) {
        console.warn('[BirthdaysController] Impossible de déduire la guilde par défaut:', err.message);
    }
    return req.query?.guild_id || req.body?.guildId || req.body?.guild_id || defaultGuildId;
}

class BirthdaysController {
    static inject = [BirthdayService];

    constructor(birthday) {
        this.birthday = birthday;
    }

    async getSettings(req) {
        try {
            const guildId = getEffectiveGuildId(req);
            if (!guildId) return { success: false, error: 'guild_id requis' };
            return { success: true, data: await this.birthday.getSettings(guildId) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async updateSettings(req) {
        try {
            const guildId = getEffectiveGuildId(req);
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const data = await this.birthday.updateSettings(guildId, req.body || {});
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getToday(req) {
        try {
            const guildId = getEffectiveGuildId(req);
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const data = await this.birthday.listToday(guildId);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getUpcoming(req) {
        try {
            const guildId = getEffectiveGuildId(req);
            if (!guildId) return { success: false, error: 'guild_id requis' };
            const days = Math.min(parseInt(req.query.days) || 365, 365);
            const data = await this.birthday.listUpcoming(guildId, days);
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getUser(req) {
        try {
            const userId = req.params.userId;
            const guildId = getEffectiveGuildId(req);
            const data = await this.birthday.getBirthday(userId, guildId);
            if (!data) return { success: false, error: 'Anniversaire non trouvé' };
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async setUser(req) {
        try {
            const userId = req.params.userId;
            const guildId = getEffectiveGuildId(req);
            const result = await this.birthday.setBirthday({
                userId,
                username: req.body.username,
                guildId,
                birthdate: req.body.birthdate
            });
            return { success: result.ok, data: result, error: result.error || null, nextChangeAt: result.nextChangeAt || null };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async deleteUser(req) {
        try {
            const userId = req.params.userId;
            const guildId = getEffectiveGuildId(req);
            const result = await this.birthday.removeBirthday(userId, guildId);
            return { success: true, data: result };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async setVisibility(req) {
        try {
            const userId = req.params.userId;
            const guildId = getEffectiveGuildId(req);
            const enabled = req.body.enabled !== false;
            await this.birthday.setVisibility(userId, guildId, enabled);
            return { success: true, data: { userId, guildId, enabled } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getHistory(req) {
        try {
            const guildId = getEffectiveGuildId(req);
            const userId = req.query.user_id || null;
            const limit = Math.min(parseInt(req.query.limit) || 50, 200);
            const data = await this.birthday.listHistory({ guildId, userId, limit });
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/birthdays')(BirthdaysController);
Get('/settings')(BirthdaysController.prototype, 'getSettings');
Get('/today')(BirthdaysController.prototype, 'getToday');
Get('/upcoming')(BirthdaysController.prototype, 'getUpcoming');
Get('/user/:userId')(BirthdaysController.prototype, 'getUser');
Get('/history')(BirthdaysController.prototype, 'getHistory');
Put('/settings')(BirthdaysController.prototype, 'updateSettings');
Patch('/settings')(BirthdaysController.prototype, 'updateSettings');
Post('/settings')(BirthdaysController.prototype, 'updateSettings');
Put('/user/:userId')(BirthdaysController.prototype, 'setUser');
Delete('/user/:userId')(BirthdaysController.prototype, 'deleteUser');
Post('/user/:userId/visibility')(BirthdaysController.prototype, 'setVisibility');

module.exports = { BirthdaysController };
