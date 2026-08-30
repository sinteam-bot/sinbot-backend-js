/**
 * src/modules/security_autoban/config/defaults.js
 *
 * Configuration par défaut pour le module Autoban (Phase 11 G17).
 */

module.exports = {
    enabled: false,
    min_account_age_hours: 24,
    block_default_avatar: false,
    username_blacklist_regex: [],
    action: 'ban', // 'ban' | 'kick' | 'quarantine'
    quarantine_role_id: null,
    dm_reason: true
};
