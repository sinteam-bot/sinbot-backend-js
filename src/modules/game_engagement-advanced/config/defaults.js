/**
 * defaults.js — feature Engagement avancé (Phase 11)
 *
 * - enabled : master toggle
 * - reminders : defaults pour les rappels
 * - word_triggers : defaults pour les triggers
 * - custom_commands : defaults pour les commandes custom
 */

module.exports = {
    enabled: true,
    allowed_roles: [],

    reminders: {
        default_cooldown_seconds: 5,
        max_per_user: 20
    },

    word_triggers: {
        default_cooldown_seconds: 10,
        default_match_type: 'exact'
    },

    custom_commands: {
        default_cooldown_seconds: 5,
        prefix: '!'
    }
};
