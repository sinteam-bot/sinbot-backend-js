/**
 * src/modules/welcome_welcome/events/rules-screening.listener.js
 *
 * Écouteur pour attribuer des rôles après validation du règlement natif Discord / Membership Screening (Phase 10 G42).
 */

const { OnEvent } = require('../../../core/index.js');
const { getConfig, config } = require('../../../config/index.js');
const logger = require('../../../utils/logger.js');

class RulesScreeningListener {
    getConfig(guildId) {
        const currentConfig = getConfig ? getConfig() : config;
        return currentConfig.welcome || currentConfig.features?.welcome || {};
    }

    async handle(oldMember, newMember) {
        if (!oldMember || !newMember || !newMember.guild) return;
        if (newMember.user?.bot) return;

        // Détection du passage de pending: true -> pending: false
        if (oldMember.pending === true && newMember.pending === false) {
            const welcomeCfg = this.getConfig(newMember.guild.id);
            const roleIds = welcomeCfg.rules_accepted_roles || welcomeCfg.roles_on_rules_accept || [];

            if (Array.isArray(roleIds) && roleIds.length > 0) {
                for (const roleId of roleIds) {
                    try {
                        if (!newMember.roles.cache.has(roleId)) {
                            await newMember.roles.add(roleId, 'Acceptation du règlement (Membership Screening)');
                        }
                    } catch (err) {
                        logger.warn(`Impossible d'ajouter le rôle ${roleId} à ${newMember.id} après acceptation des règles: ${err.message}`, 'WELCOME');
                    }
                }
            }

            logger.info(`[RULES_SCREENING] ${newMember.user.tag} a validé le règlement de ${newMember.guild.name}.`, 'WELCOME');
        }
    }
}

OnEvent('guildMemberUpdate')(RulesScreeningListener.prototype, 'handle');

module.exports = { RulesScreeningListener };
