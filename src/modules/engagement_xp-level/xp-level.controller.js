const { Controller, Get, Post, Put } = require('../../core/index.js');
const { XPLevelService } = require('./xp-level.service.js');
const { setFeatureConfig } = require('../../config/c12-loader.js');

class XPLevelController {
    static inject = [XPLevelService];

    constructor(service) {
        this.service = service;
    }

    async getLeaderboard(req) {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const { entries, total } = await this.service.getLeaderboard(limit, offset);
        return {
            success: true,
            data: {
                entries,
                total,
                limit,
                offset,
                page: Math.floor(offset / limit) + 1,
                pages: Math.ceil(total / limit)
            }
        };
    }

    async getUserProfile(req) {
        const userId = req.params?.userId || req.query?.user_id;
        if (!userId) {
            return { success: false, error: 'userId requis' };
        }
        const profile = await this.service.getUserProfile(userId);
        return { success: true, data: profile };
    }

    async getRewardRoles(req) {
        const guildId = req.query?.guild_id || null;
        const roles = await this.service.repo.getRewardRoles(guildId);
        return { success: true, data: roles };
    }

    async getConfig(req) {
        const guildId = req.params?.guildId || req.query?.guild_id || process.env.GUILD_ID || '1543570824542298122';
        const cfg = this.service.getConfig(guildId);
        return { success: true, data: cfg };
    }

    async updateConfig(req) {
        try {
            const patch = req.body || {};
            const guildId = req.params?.guildId || req.query?.guild_id || req.body?.guild_id || process.env.GUILD_ID || '1543570824542298122';
            const updated = await setFeatureConfig(guildId, 'xp', patch);
            return { success: true, data: updated };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    _deepMerge(target, source) {
        if (typeof source !== 'object' || source === null) return source;
        const out = Array.isArray(target) ? [...target] : { ...(target || {}) };
        for (const [k, v] of Object.entries(source)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                out[k] = this._deepMerge(out[k], v);
            } else {
                out[k] = v;
            }
        }
        return out;
    }

    async grantXP(req) {
        const { userId, username, amount, reason } = req.body || {};
        if (!userId || !amount) {
            return { success: false, error: 'userId et amount requis' };
        }
        const result = await this.service.addXP(userId, username || `User-${userId}`, parseInt(amount, 10), 'admin_grant', reason || 'Ajout manuel administrateur');
        return { success: true, data: result };
    }

    async adjustXP(req) {
        const { userId, username, delta, reason } = req.body || {};
        if (!userId || typeof delta !== 'number') {
            return { success: false, error: 'userId et delta (number) requis' };
        }
        const result = await this.service.addXP(userId, username || `User-${userId}`, delta, 'admin_adjust', reason || 'Ajustement administrateur');
        return { success: true, data: result };
    }

    async resetUserXP(req) {
        const { userId } = req.body || {};
        if (!userId) return { success: false, error: 'userId requis' };
        const result = await this.service.repo.resetUserXP(userId);
        return { success: true, data: result };
    }
}

Controller('/api/xp')(XPLevelController);
Get('/leaderboard')(XPLevelController.prototype, 'getLeaderboard');
Get('/user/:userId')(XPLevelController.prototype, 'getUserProfile');
Get('/rewards')(XPLevelController.prototype, 'getRewardRoles');
Get('/config')(XPLevelController.prototype, 'getConfig');
Put('/config')(XPLevelController.prototype, 'updateConfig');
Post('/grant')(XPLevelController.prototype, 'grantXP');
Post('/adjust')(XPLevelController.prototype, 'adjustXP');
Post('/reset')(XPLevelController.prototype, 'resetUserXP');

module.exports = {
    XPLevelController
};
