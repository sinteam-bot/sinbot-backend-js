/**
 * defaults.js — feature Birthdays (Phase 7)
 *
 * mode:
 *   - public  : une seule date par user, partagée entre tous les serveurs
 *   - private : une date par couple (user, guild_id)
 *
 * cooldown (spec Draftbot):
 *   - 1er changement : 1 jour
 *   - 2ème          : 2 jours
 *   - 3ème          : 6 mois
 *   - 4ème+         : 1 an
 *
 * gifts: jusqu'à max_per_user (2 par défaut) par user.
 *   - type: 'role' | 'xp' | 'money' | 'item' | 'custom'
 *   - amount: nombre (1 pour un rôle, valeur pour xp/money)
 */

module.exports = {
    enabled: false,
    allowed_roles: [],

    mode: 'public',
    default_visibility: true,

    announce: {
        channel_id: null,
        hour: 9,
        timezone: 'Europe/Paris',
        ping_role_id: null,
        message_template: '🎂 Joyeux anniversaire {user} ! Tu fêtes tes **{age} ans** aujourd\'hui ! 🎉'
    },

    temp_role: {
        enabled: true,
        role_id: null
    },

    gifts: {
        max_per_user: 2,
        xp_per_birthday: 500
    },

    cooldown: {
        first_change_days: 1,
        second_change_days: 2,
        third_change_days: 180,
        default_change_days: 365
    }
};
