/**
 * defaults.js — Sticky Roles (Phase 8)
 *
 * - enabled : master toggle
 * - max_per_user : limite dure de rôles sticky par user (sécurité)
 * - restore_delay_ms : délai avant de re-attribuer le rôle après le
 *   guildMemberAdd (évite les race conditions avec les bots)
 */

module.exports = {
    enabled: false,
    allowed_roles: [],
    max_per_user: 10,
    restore_delay_ms: 2000
};
