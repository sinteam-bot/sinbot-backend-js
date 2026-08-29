/**
 * StickyRolesListener — capture au leave + restore au join
 *
 * Le service est appelé avec un léger delay (config.restore_delay_ms)
 * après le join pour éviter les race conditions avec les bots et
 * les cascades de roles du bot de vérification.
 */

const { OnEvent, getConfig } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/index.js');
const { StickyRolesService } = require('../services/sticky-roles.service.js');

class StickyRolesListener {
    static inject = [StickyRolesService];

    constructor(service) {
        this.service = service;
    }

    async _ensureEnabled(guildId) {
        const state = await featureRegistry.get(guildId, 'sticky-roles');
        if (!state.enabled) return null;
        return state.config;
    }

    async onMemberAdd(member) {
        if (member?.user?.bot) return;
        const cfg = await this._ensureEnabled(member.guild.id);
        if (!cfg) return;

        setTimeout(async () => {
            try {
                await this.service.restoreOnJoin(member.guild, member, cfg);
            } catch (err) {
                console.warn(`[StickyRoles] onMemberAdd failed: ${err.message}`);
            }
        }, cfg.restore_delay_ms || 2000);
    }

    async onMemberRemove(member) {
        if (member?.user?.bot) return;
        const cfg = await this._ensureEnabled(member.guild.id);
        if (!cfg) return;
        await this.service.snapshotOnLeave(member.guild, member);
    }
}

OnEvent('guildMemberAdd', { configKey: 'features.sticky-roles', priority: 20 })(StickyRolesListener.prototype, 'onMemberAdd');
OnEvent('guildMemberRemove', { configKey: 'features.sticky-roles', priority: 20 })(StickyRolesListener.prototype, 'onMemberRemove');

module.exports = { StickyRolesListener };
