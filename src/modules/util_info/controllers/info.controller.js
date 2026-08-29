/**
 * InfoController — endpoints REST pour les commandes d'info
 *
 *   GET  /api/info/server?guild_id=   : retourne un JSON (pas un embed)
 *   GET  /api/info/user/:userId?guild_id=
 *   GET  /api/info/avatar/:userId
 *
 * Pour les embeds discord, les commands slash sont plus adaptées
 * (on garde le REST pour le dashboard / widgets).
 */

const { Controller, Get } = require('../../../core/index.js');
const { InfoService } = require('../services/info.service.js');

class InfoController {
    static inject = [InfoService];

    constructor(info) {
        this.info = info;
    }

    async getServer(req) {
        try {
            if (!this.info._client) return { success: false, error: 'client_unavailable' };
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const guild = await this.info._client.guilds.fetch(guildId).catch(() => null);
            if (!guild) return { success: false, error: 'guild_not_found' };
            return {
                success: true,
                data: {
                    id: guild.id,
                    name: guild.name,
                    memberCount: guild.memberCount,
                    ownerId: guild.ownerId,
                    createdAt: guild.createdAt?.toISOString() || null,
                    iconURL: guild.iconURL?.({ dynamic: true, size: 256 }) || null,
                    bannerURL: guild.bannerURL?.({ dynamic: true }) || null,
                    channels: guild.channels?.cache?.size || 0,
                    roles: guild.roles?.cache?.size || 0,
                    emojis: guild.emojis?.cache?.size || 0,
                    features: guild.features || []
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getUser(req) {
        try {
            if (!this.info._client) return { success: false, error: 'client_unavailable' };
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const userId = req.params.userId;
            const guild = await this.info._client.guilds.fetch(guildId).catch(() => null);
            if (!guild) return { success: false, error: 'guild_not_found' };
            const member = await guild.members.fetch(userId).catch(() => null);
            const user = member?.user || await this.info._client.users.fetch(userId).catch(() => null);
            if (!user) return { success: false, error: 'user_not_found' };
            return {
                success: true,
                data: {
                    id: user.id,
                    username: user.username,
                    globalName: user.globalName,
                    bot: user.bot,
                    avatarURL: user.displayAvatarURL?.({ dynamic: true, size: 256 }) || null,
                    createdTimestamp: user.createdTimestamp,
                    joinedTimestamp: member?.joinedTimestamp || null,
                    nick: member?.nick || null,
                    roles: member ? Array.from(member.roles.cache.keys()).filter(id => id !== guild.id) : []
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getAvatar(req) {
        try {
            if (!this.info._client) return { success: false, error: 'client_unavailable' };
            const user = await this.info._client.users.fetch(req.params.userId).catch(() => null);
            if (!user) return { success: false, error: 'user_not_found' };
            return { success: true, data: { url: this.info.getAvatarUrl(user, { size: 1024 }) } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/info')(InfoController);
Get('/server')(InfoController.prototype, 'getServer');
Get('/user/:userId')(InfoController.prototype, 'getUser');
Get('/avatar/:userId')(InfoController.prototype, 'getAvatar');

module.exports = { InfoController };
