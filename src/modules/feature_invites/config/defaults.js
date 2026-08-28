/**
 * config/defaults.js — feature Invites (InviteLogger-like)
 */

module.exports = {
    enabled: false,
    allowed_roles: [],

    join_log_channel_id: null,
    leave_log_channel_id: null,
    leaderboard_channel_id: null,

    join_message: ':incoming_envelope: {member} a rejoint le serveur via l\'invitation de **{inviter}** ({invite_uses} utilisation{plural}). C\'est l\'invité #{member_number}.',
    leave_message: ':outbox_tray: {member} a quitté le serveur (était invité par **{inviter}**).',

    embed_color: '#2F3136',
    show_account_age: true,

    track_bots: false,
    track_vanity: false,
    track_unknown: true,

    fake_account_threshold_days: 7,
    fake_no_avatar: true,
    fake_duplicate_ip: false,

    max_invites_per_user: 50,
    invite_cooldown_seconds: 0,

    bonus_invites: {
        enabled: false,
        role_rewards: []
    },

    leaderboard: {
        enabled: true,
        page_size: 25,
        show_avatars: true
    }
};
