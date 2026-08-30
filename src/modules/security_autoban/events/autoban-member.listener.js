/**
 * src/modules/security_autoban/events/autoban-member.listener.js
 *
 * Écouteur pour déclencher l'analyse autoban à l'arrivée d'un membre (Phase 11 G17).
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { AutobanService } = require('../services/autoban.service.js');

class AutobanMemberListener {
    static inject = [AutobanService];

    constructor(service) {
        this.service = service;
    }

    async _getConfig(guildId) {
        const state = await featureRegistry.get(guildId, 'autoban');
        return state.enabled ? state.config : null;
    }

    async handle(member) {
        if (!member || !member.guild || member.user?.bot) return;

        const config = await this._getConfig(member.guild.id);
        if (!config) return;

        await this.service.processNewMember(member, config);
    }
}

OnEvent('guildMemberAdd', { priority: 1, configKey: 'features.autoban' })(AutobanMemberListener.prototype, 'handle');

module.exports = { AutobanMemberListener };
