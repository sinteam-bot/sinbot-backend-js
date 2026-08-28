/**
 * config/schema.js — validation joi pour la feature Invites
 */

const joi = require('joi');

const roleRewardSchema = joi.object({
    role_id: joi.string().required(),
    invites_required: joi.number().integer().min(1).required(),
    stack: joi.boolean().default(false)
});

module.exports = joi.object({
    enabled: joi.boolean().default(false),
    allowed_roles: joi.array().items(joi.string()).default([]),

    join_log_channel_id: joi.string().allow(null).default(null),
    leave_log_channel_id: joi.string().allow(null).default(null),
    leaderboard_channel_id: joi.string().allow(null).default(null),

    join_message: joi.string().min(1).max(1024).default(':incoming_envelope: {member} a rejoint le serveur via l\'invitation de **{inviter}** ({invite_uses} utilisation{plural}).'),
    leave_message: joi.string().min(1).max(1024).default(':outbox_tray: {member} a quitté le serveur (était invité par **{inviter}**).'),

    embed_color: joi.string().pattern(/^#[0-9A-F]{6}$/i).default('#2F3136'),
    show_account_age: joi.boolean().default(true),

    track_bots: joi.boolean().default(false),
    track_vanity: joi.boolean().default(false),
    track_unknown: joi.boolean().default(true),

    fake_account_threshold_days: joi.number().integer().min(0).max(365).default(7),
    fake_no_avatar: joi.boolean().default(true),
    fake_duplicate_ip: joi.boolean().default(false),

    max_invites_per_user: joi.number().integer().min(1).max(100000).default(50),
    invite_cooldown_seconds: joi.number().integer().min(0).max(3600).default(0),

    bonus_invites: joi.object({
        enabled: joi.boolean().default(false),
        role_rewards: joi.array().items(roleRewardSchema).default([])
    }).default({ enabled: false, role_rewards: [] }),

    leaderboard: joi.object({
        enabled: joi.boolean().default(true),
        page_size: joi.number().integer().min(5).max(100).default(25),
        show_avatars: joi.boolean().default(true)
    }).default({ enabled: true, page_size: 25, show_avatars: true })
});
