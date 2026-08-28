/**
 * ReactionListener — applique les roles sur reactionAdd/Remove
 *
 * - Sur reactionAdd : si l'emoji correspond à un reaction-role sur
 *   ce message, on ajoute le rôle au member
 * - Sur reactionRemove : on retire le rôle
 * - Sur messageDelete : on nettoie les reaction-roles liés (purge)
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { ReactionRolesService } = require('../services/reaction-roles.service.js');

class ReactionListener {
    static inject = [ReactionRolesService];

    constructor(service) {
        this.service = service;
    }

    async _ensureEnabled(guildId) {
        const state = await featureRegistry.get(guildId, 'reaction-roles');
        return state.enabled ? state.config : null;
    }

    async onReactionAdd(reaction, user) {
        if (!reaction?.message?.guild) return;
        if (user?.bot) return;
        const cfg = await this._ensureEnabled(reaction.message.guild.id);
        if (!cfg) return;

        const rr = await this.service.findForReaction(reaction.message.id, reaction.emoji);
        if (!rr) return;
        if (cfg.self_assignable === false) {
            const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
            if (!member?.permissions?.has?.('ManageRoles')) return;
        }
        try {
            const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
            if (member && !member.roles.cache.has(rr.roleId)) {
                await member.roles.add(rr.roleId);
            }
        } catch (err) {
            console.warn(`[ReactionListener] add failed: ${err.message}`);
        }
    }

    async onReactionRemove(reaction, user) {
        if (!reaction?.message?.guild) return;
        if (user?.bot) return;
        const cfg = await this._ensureEnabled(reaction.message.guild.id);
        if (!cfg) return;

        const rr = await this.service.findForReaction(reaction.message.id, reaction.emoji);
        if (!rr) return;
        try {
            const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
            if (member && member.roles.cache.has(rr.roleId)) {
                await member.roles.remove(rr.roleId);
            }
        } catch (err) {
            console.warn(`[ReactionListener] remove failed: ${err.message}`);
        }
    }

    async onMessageDelete(message) {
        if (!message?.guild) return;
        try {
            await this.service.deleteByMessage(message.guild.id, message.id);
        } catch (err) {
            console.warn(`[ReactionListener] cleanup failed: ${err.message}`);
        }
    }
}

OnEvent('messageReactionAdd', { configKey: 'features.reaction-roles', priority: 30 })(ReactionListener.prototype, 'onReactionAdd');
OnEvent('messageReactionRemove', { configKey: 'features.reaction-roles', priority: 30 })(ReactionListener.prototype, 'onReactionRemove');
OnEvent('messageDelete', { configKey: 'features.reaction-roles', priority: 30 })(ReactionListener.prototype, 'onMessageDelete');

module.exports = { ReactionListener };
