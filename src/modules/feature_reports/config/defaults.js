/**
 * defaults.js — feature Reports (Phase 12)
 */

module.exports = {
    enabled: false,
    allowed_roles: [],

    report_channel_id: null,
    log_channel_id: null,
    cooldown_seconds: 300,         // 5 min
    max_open_per_user: 5,
    dm_on_resolve: true,

    categories: [
        { id: 'spam', label: '📧 Spam / Pub' },
        { id: 'harassment', label: '⚠️ Harcèlement' },
        { id: 'inappropriate', label: '🔞 Contenu inapproprié' },
        { id: 'misinformation', label: '❌ Désinformation' },
        { id: 'other', label: '❓ Autre' }
    ]
};
