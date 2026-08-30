/**
 * src/modules/util_server_stats/events/member-count.listener.js
 *
 * Écouteurs pour actualiser les compteurs de membres lors d'arrivées ou de départs (Phase 9 G08).
 */

const { OnEvent } = require('../../../core/index.js');
const { ServerStatsService } = require('../services/server-stats.service.js');

class MemberCountListener {
    static inject = [ServerStatsService];

    constructor(statsService) {
        this.statsService = statsService;
        this._pendingDebounces = new Map();
    }

    _triggerDebouncedUpdate(guild) {
        if (!guild) return;
        if (this._pendingDebounces.has(guild.id)) return;

        // Debounce de 30 secondes pour regrouper les arrivées/départs
        const timer = setTimeout(async () => {
            this._pendingDebounces.delete(guild.id);
            await this.statsService.updateGuildStats(guild);
        }, 30000);

        this._pendingDebounces.set(guild.id, timer);
    }

    async handleMemberAdd(member) {
        if (member?.guild) {
            this._triggerDebouncedUpdate(member.guild);
        }
    }

    async handleMemberRemove(member) {
        if (member?.guild) {
            this._triggerDebouncedUpdate(member.guild);
        }
    }
}

OnEvent('guildMemberAdd')(MemberCountListener.prototype, 'handleMemberAdd');
OnEvent('guildMemberRemove')(MemberCountListener.prototype, 'handleMemberRemove');

module.exports = { MemberCountListener };
