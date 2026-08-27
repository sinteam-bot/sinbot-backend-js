/**
 * defaults.js — valeurs par défaut de la feature Logs & Stats (Phase 4)
 *
 * `channels` permet de router chaque type d'event vers un salon
 * Discord dédié. Si null, l'event est seulement persisté en BDD
 * (visible dans le dashboard mais pas posté en embed).
 *
 * `events` permet d'activer/désactiver au cas par cas.
 *
 * `ignored_channels` / `ignored_users` excluent certains salons
 * (ex: logs bot) ou utilisateurs (ex: autres bots).
 *
 * `whitelist_domains` évite la sanitization des liens de confiance.
 */

module.exports = {
    enabled: false,
    allowed_roles: [],

    channels: {
        moderation: null,
        messages: null,
        members: null,
        voice: null,
        roles: null,
        channels_log: null,
        server: null
    },

    events: {
        message_delete: true,
        message_edit: true,
        message_bulk_delete: true,
        member_join: true,
        member_leave: true,
        member_update: true,
        member_ban_add: true,
        member_ban_remove: true,
        role_create: true,
        role_update: true,
        role_delete: true,
        channel_create: true,
        channel_update: true,
        channel_delete: true,
        voice_state_update: true,
        guild_update: true,
        emoji_create: true,
        emoji_delete: true
    },

    format: 'embed',
    color: '#2F3136',

    ignored_channels: [],
    ignored_users: [],

    whitelist_domains: ['discord.com', 'discord.gg', 'github.com'],

    settings: {
        max_content_length: 1024,
        truncate_attachments: true,
        live_feed_emit: true
    }
};
