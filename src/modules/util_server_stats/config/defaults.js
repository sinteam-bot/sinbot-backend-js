/**
 * src/modules/util_server_stats/config/defaults.js
 *
 * Configuration par défaut pour le module Server Stats (Phase 9 G08).
 */

module.exports = {
    enabled: true,
    update_interval_minutes: 10,
    allowed_types: ['total_members', 'human_members', 'bot_members', 'channel_count', 'role_count']
};
