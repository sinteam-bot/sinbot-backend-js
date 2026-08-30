/**
 * src/modules/util_word_triggers/events/member-role-update.listener.js
 *
 * Écouteur de changement de rôles (Phase 8 G31).
 * Détecte les gains et pertes de rôles d'un membre Discord pour déclencher des automatisations.
 */

const { OnEvent } = require('../../../core/index.js');
const logger = require('../../../utils/logger.js');

class MemberRoleUpdateListener {
    async handle(oldMember, newMember) {
        if (!oldMember || !newMember || !newMember.guild) return;
        if (newMember.user?.bot) return;

        try {
            const oldRoles = oldMember.roles?.cache || new Map();
            const newRoles = newMember.roles?.cache || new Map();

            // Rôles ajoutés
            const addedRoles = [];
            newRoles.forEach((role, id) => {
                if (!oldRoles.has(id)) addedRoles.push(role);
            });

            // Rôles retirés
            const removedRoles = [];
            oldRoles.forEach((role, id) => {
                if (!newRoles.has(id)) removedRoles.push(role);
            });

            if (addedRoles.length === 0 && removedRoles.length === 0) return;

            for (const role of addedRoles) {
                logger.info(`[ROLE_TRIGGER] ${newMember.user.username} a reçu le rôle "${role.name}" (${role.id}) sur ${newMember.guild.name}`, 'TRIGGERS');
            }

            for (const role of removedRoles) {
                logger.info(`[ROLE_TRIGGER] ${newMember.user.username} a perdu le rôle "${role.name}" (${role.id}) sur ${newMember.guild.name}`, 'TRIGGERS');
            }
        } catch (err) {
            logger.warn(`Erreur MemberRoleUpdateListener: ${err.message}`, 'TRIGGERS');
        }
    }
}

OnEvent('guildMemberUpdate')(MemberRoleUpdateListener.prototype, 'handle');

module.exports = { MemberRoleUpdateListener };
