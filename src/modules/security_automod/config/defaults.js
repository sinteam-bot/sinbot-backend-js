/**
 * defaults.js — valeurs par défaut de la feature automod
 *
 * Ces valeurs sont utilisées quand :
 *   - La feature n'est pas encore configurée
 *   - Le bloc YAML legacy `automod:` est absent
 *   - La table feature_flags n'a pas de ligne pour ce guild
 *
 * Le `allowed_roles` est vide par défaut, ce qui signifie "aucune restriction"
 * (tous les utilisateurs avec permission de modération peuvent l'utiliser).
 */

module.exports = {
    enabled: false,
    allowed_roles: [],

    spam: {
        enabled: true,
        max_messages: 5,
        window_seconds: 5,
        max_mentions: 3,
        mentions_window_seconds: 10,
        action: 'warn'
    },

    badwords: {
        enabled: true,
        list: [],
        case_sensitive: false,
        whole_word: true,
        action: 'delete_warn'
    },

    anti_raid: {
        enabled: true,
        join_threshold: 8,
        window_seconds: 30,
        action: 'alert',
        lock_duration_seconds: 300
    },

    anti_invite: {
        enabled: true,
        whitelist_guilds: [],
        action: 'delete_warn'
    },

    anti_link: {
        enabled: false,
        whitelist_domains: ['github.com', 'discord.com', 'discord.gg'],
        action: 'delete'
    },

    mass_mention: {
        enabled: true,
        threshold: 5,
        action: 'delete_warn'
    },

    anti_caps: {
        enabled: false,
        min_length: 10,
        caps_ratio: 0.7,
        action: 'delete_warn'
    },

    anti_attachment_spam: {
        enabled: false,
        max_attachments: 3,
        window_seconds: 10,
        max_per_message: 5,
        action: 'delete_warn'
    },

    anti_zalgo: {
        enabled: false,
        max_zalgo_chars: 3,
        action: 'delete_warn'
    },

    anti_sticker: {
        enabled: false,
        action: 'delete'
    },

    channel_rules: {},

    sanctions: {
        warn_expire_days: 30,
        progression: [
            { warnings: 3, action: 'mute', duration: '1h' },
            { warnings: 5, action: 'mute', duration: '24h' },
            { warnings: 7, action: 'kick' },
            { warnings: 10, action: 'ban' }
        ]
    },

    log_channel_id: null,
    dm_on_action: true
};
