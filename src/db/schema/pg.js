const { pgTable, text, integer, serial, timestamp, primaryKey, index, uniqueIndex } = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');

// 1. user_events
const userEvents = pgTable('user_events', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    eventType: text('event_type').notNull(),
    eventData: text('event_data'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 2. form_responses
const formResponses = pgTable('form_responses', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    formName: text('form_name').notNull(),
    responses: text('responses'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 3. user_birthdays
const userBirthdays = pgTable('user_birthdays', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    birthdate: text('birthdate').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 4. user_xp
const userXp = pgTable('user_xp', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    xp: integer('xp').default(0),
    level: integer('level').default(1),
    totalXpEarned: integer('total_xp_earned').default(0),
    messagesCount: integer('messages_count').default(0),
    voiceMinutes: integer('voice_minutes').default(0),
    eventsParticipated: integer('events_participated').default(0),
    lastMessageXp: text('last_message_xp'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 5. xp_transactions
const xpTransactions = pgTable('xp_transactions', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    xpAmount: integer('xp_amount').notNull(),
    xpType: text('xp_type').notNull(),
    description: text('description'),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 6. voice_sessions
const voiceSessions = pgTable('voice_sessions', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    channelId: text('channel_id').notNull(),
    channelName: text('channel_name').notNull(),
    joinTime: text('join_time').default(sql`CURRENT_TIMESTAMP`),
    leaveTime: text('leave_time'),
    durationMinutes: integer('duration_minutes').default(0),
    xpEarned: integer('xp_earned').default(0)
});

// 7. events
const events = pgTable('events', {
    id: serial('id').primaryKey(),
    eventName: text('event_name').notNull(),
    eventDescription: text('event_description'),
    eventDate: text('event_date'),
    xpReward: integer('xp_reward').default(0),
    createdBy: text('created_by'),
    isActive: integer('is_active').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 8. event_participants
const eventParticipants = pgTable('event_participants', {
    id: serial('id').primaryKey(),
    eventId: integer('event_id').notNull(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    xpEarned: integer('xp_earned').default(0),
    joinedAt: text('joined_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
    uniqueIndex('idx_pg_event_user').on(table.eventId, table.userId)
]);

// 9. server_members
const serverMembers = pgTable('server_members', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    discriminator: text('discriminator'),
    tag: text('tag'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    displayColor: text('display_color'),
    highestRoleId: text('highest_role_id'),
    highestRoleName: text('highest_role_name'),
    highestRoleColor: text('highest_role_color'),
    joinedAt: text('joined_at'),
    accountCreatedAt: text('account_created_at'),
    isBot: integer('is_bot').default(0),
    rejoinCount: integer('rejoin_count').default(0),
    leftAt: text('left_at'),
    roles: text('roles'),
    presence: text('presence').default('offline'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 10. member_history
const memberHistory = pgTable('member_history', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    action: text('action').notNull(),
    guildId: text('guild_id').notNull(),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 11. welcome_config
const welcomeConfig = pgTable('welcome_config', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull().unique(),
    welcomeChannelId: text('welcome_channel_id'),
    welcomeMessage: text('welcome_message'),
    autoRoles: text('auto_roles'),
    isEnabled: integer('is_enabled').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 12. openaimessages
const openaimessages = pgTable('openaimessages', {
    id: serial('id').primaryKey(),
    msgid: text('msgid').notNull().unique(),
    prompt: text('prompt'),
    instruction: text('instruction'),
    model: text('model'),
    tokeninput: integer('tokeninput'),
    tokenoutput: integer('tokenoutput'),
    content: text('content'),
    previousmsgid: text('previousmsgid'),
    rawdata: text('rawdata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 13. guild_members
const guildMembers = pgTable('guild_members', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 14. grognement
const grognement = pgTable('grognement', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 15. user_captchas
const userCaptchas = pgTable('user_captchas', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    guildId: text('guild_id').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    channelId: text('channel_id').notNull(),
    attempts: integer('attempts').default(0),
    isVerified: integer('is_verified').default(0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text('expires_at'),
    verifiedAt: text('verified_at'),
    expiredAt: text('expired_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
    uniqueIndex('idx_pg_user_guild_captcha').on(table.userId, table.guildId)
]);

// 16. captcha_config
const captchaConfig = pgTable('captcha_config', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull().unique(),
    channelId: text('channel_id'),
    verifiedRoleId: text('verified_role_id'),
    timeoutMinutes: integer('timeout_minutes').default(10),
    maxAttempts: integer('max_attempts').default(3),
    isEnabled: integer('is_enabled').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 17. bump_logs
const bumpLogs = pgTable('bump_logs', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    userId: text('user_id'),
    username: text('username'),
    bumpedAt: text('bumped_at').default(sql`CURRENT_TIMESTAMP`),
    reminderSent: integer('reminder_sent').default(0),
    reminderSentAt: text('reminder_sent_at')
});

// 18. discord_channels
const discordChannels = pgTable('discord_channels', {
    channelId: text('channel_id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    parentId: text('parent_id'),
    position: integer('position').default(0),
    topic: text('topic'),
    isNsfw: integer('is_nsfw').default(0),
    createdAt: text('created_at'),
    deletedAt: text('deleted_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 19. discord_threads
const discordThreads = pgTable('discord_threads', {
    threadId: text('thread_id').primaryKey(),
    guildId: text('guild_id').notNull(),
    parentId: text('parent_id').notNull(),
    name: text('name').notNull(),
    ownerId: text('owner_id'),
    archived: integer('archived').default(0),
    locked: integer('locked').default(0),
    messageCount: integer('message_count').default(0),
    memberCount: integer('member_count').default(0),
    createdAt: text('created_at'),
    deletedAt: text('deleted_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 20. discord_users
const discordUsers = pgTable('discord_users', {
    userId: text('user_id').primaryKey(),
    username: text('username').notNull(),
    globalName: text('global_name'),
    discriminator: text('discriminator'),
    bot: integer('bot').default(0),
    avatarUrl: text('avatar_url'),
    bannerUrl: text('banner_url'),
    createdAt: text('created_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 21. discord_messages
const discordMessages = pgTable('discord_messages', {
    messageId: text('message_id').primaryKey(),
    channelId: text('channel_id').notNull(),
    threadId: text('thread_id'),
    guildId: text('guild_id').notNull(),
    authorId: text('author_id').notNull(),
    authorUsername: text('author_username').notNull(),
    content: text('content'),
    pinned: integer('pinned').default(0),
    embedsJson: text('embeds_json'),
    attachmentsJson: text('attachments_json'),
    reactionsJson: text('reactions_json'),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 22. counter_state
const counterState = pgTable('counter_state', {
    channelId: text('channel_id').primaryKey(),
    currentNumber: integer('current_number').default(0),
    errorCount: integer('error_count').default(0),
    lastUserId: text('last_user_id'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 23. countdown_state
const countdownState = pgTable('countdown_state', {
    channelId: text('channel_id').primaryKey(),
    currentNumber: integer('current_number').default(900),
    errorCount: integer('error_count').default(0),
    isTrapActive: integer('is_trap_active').default(0),
    trapNumber: integer('trap_number'),
    lastUserId: text('last_user_id'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 24. countdown_scores
const countdownScores = pgTable('countdown_scores', {
    channelId: text('channel_id').notNull(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    score: integer('score').default(0)
}, (table) => [
    primaryKey({ columns: [table.channelId, table.userId] })
]);

// 25. bot_version_state
const botVersionState = pgTable('bot_version_state', {
    key: text('key').primaryKey(),
    value: text('value'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 26. discord_roles
const discordRoles = pgTable('discord_roles', {
    roleId: text('role_id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    color: integer('color').default(0),
    colorHex: text('color_hex'),
    iconUrl: text('icon_url'),
    unicodeEmoji: text('unicode_emoji'),
    memberCount: integer('member_count').default(0),
    hoist: integer('hoist').default(0),
    position: integer('position').default(0),
    permissions: text('permissions'),
    managed: integer('managed').default(0),
    mentionable: integer('mentionable').default(0),
    createdAt: text('created_at'),
    deletedAt: text('deleted_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 27. discord_events_archive
const discordEventsArchive = pgTable('discord_events_archive', {
    id: serial('id').primaryKey(),
    eventName: text('event_name').notNull(),
    guildId: text('guild_id'),
    targetId: text('target_id'),
    userId: text('user_id'),
    username: text('username'),
    summary: text('summary'),
    dataJson: text('data_json'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
    index('idx_pg_events_name').on(table.eventName),
    index('idx_pg_events_created').on(table.createdAt)
]);

// 28. discord_emojis
const discordEmojis = pgTable('discord_emojis', {
    emojiId: text('emoji_id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    animated: integer('animated').default(0),
    url: text('url'),
    rolesJson: text('roles_json'),
    createdAt: text('created_at'),
    deletedAt: text('deleted_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 29. guild_settings (Phase 0: multi-guild foundations)
const guildSettings = pgTable('guild_settings', {
    guildId: text('guild_id').primaryKey(),
    name: text('name').notNull(),
    locale: text('locale').default('fr'),
    timezone: text('timezone').default('Europe/Paris'),
    ownerId: text('owner_id'),
    premiumTier: integer('premium_tier').default(0),
    joinedAt: integer('joined_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
});

// 30. feature_flags (Phase 0: per-guild feature toggles + config)
const featureFlags = pgTable('feature_flags', {
    guildId: text('guild_id').notNull(),
    featureName: text('feature_name').notNull(),
    enabled: integer('enabled').notNull().default(0),
    configJson: text('config_json').notNull().default('{}'),
    allowedRoles: text('allowed_roles').notNull().default('[]'),
    updatedBy: text('updated_by'),
    updatedAt: integer('updated_at').notNull()
}, (table) => [
    primaryKey({ columns: [table.guildId, table.featureName] }),
    index('idx_pg_feature_flags_enabled').on(table.enabled)
]);

// 31. user_warnings (Phase 1: automod)
const userWarnings = pgTable('user_warnings', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    modId: text('mod_id').notNull(),
    reason: text('reason').notNull(),
    source: text('source').notNull().default('manual'),
    rule: text('rule'),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at'),
    active: integer('active').notNull().default(1)
}, (table) => [
    index('idx_pg_user_warnings_guild_user').on(table.guildId, table.userId),
    index('idx_pg_user_warnings_active').on(table.active)
]);

// 32. user_sanctions (Phase 1: automod)
const userSanctions = pgTable('user_sanctions', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    reason: text('reason').notNull(),
    modId: text('mod_id').notNull(),
    durationMs: integer('duration_ms'),
    startsAt: integer('starts_at').notNull(),
    expiresAt: integer('expires_at'),
    revokedBy: text('revoked_by'),
    revokedAt: integer('revoked_at'),
    revokedReason: text('revoked_reason'),
    active: integer('active').notNull().default(1),
    createdAt: integer('created_at').notNull()
}, (table) => [
    index('idx_pg_user_sanctions_guild_user').on(table.guildId, table.userId),
    index('idx_pg_user_sanctions_active').on(table.active)
]);

// 33. mod_logs (Phase 1: automod audit log)
const modLogs = pgTable('mod_logs', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    modId: text('mod_id'),
    action: text('action').notNull(),
    channelId: text('channel_id'),
    messageId: text('message_id'),
    reason: text('reason'),
    metadata: text('metadata'),
    source: text('source').notNull().default('manual'),
    createdAt: integer('created_at').notNull()
}, (table) => [
    index('idx_pg_mod_logs_guild_created').on(table.guildId, table.createdAt),
    index('idx_pg_mod_logs_guild_user').on(table.guildId, table.userId)
]);

// 34. tickets (Phase 3)
const tickets = pgTable('tickets', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    userId: text('user_id').notNull(),
    category: text('category').notNull().default('support'),
    subject: text('subject'),
    status: text('status').notNull().default('open'),
    claimedBy: text('claimed_by'),
    closedBy: text('closed_by'),
    closedAt: integer('closed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
}, (table) => [
    index('idx_pg_tickets_guild_status').on(table.guildId, table.status),
    index('idx_pg_tickets_user').on(table.userId),
    index('idx_pg_tickets_channel').on(table.channelId)
]);

// 35. ticket_messages (Phase 3)
const ticketMessages = pgTable('ticket_messages', {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id').notNull(),
    authorId: text('author_id').notNull(),
    content: text('content'),
    attachments: text('attachments'),
    isStaff: integer('is_staff').notNull().default(0),
    createdAt: integer('created_at').notNull()
}, (table) => [
    index('idx_pg_ticket_messages_ticket').on(table.ticketId)
]);

// 36. event_log (Phase 4: generic event log)
const eventLog = pgTable('event_log', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    eventType: text('event_type').notNull(),
    actorId: text('actor_id'),
    targetId: text('target_id'),
    channelId: text('channel_id'),
    metadata: text('metadata'),
    summary: text('summary'),
    createdAt: integer('created_at').notNull()
}, (table) => [
    index('idx_pg_event_log_guild_type').on(table.guildId, table.eventType),
    index('idx_pg_event_log_guild_created').on(table.guildId, table.createdAt),
    index('idx_pg_event_log_actor').on(table.actorId),
    index('idx_pg_event_log_target').on(table.targetId)
]);

// 37. welcome_cards (Phase 6: cached SVG cards)
const welcomeCards = pgTable('welcome_cards', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    template: text('template').notNull(),
    payload: text('payload').notNull(),
    svg: text('svg').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at')
}, (table) => [
    index('idx_pg_welcome_cards_user').on(table.guildId, table.userId, table.template)
]);

module.exports = {
    userEvents,
    formResponses,
    userBirthdays,
    userXp,
    xpTransactions,
    voiceSessions,
    events,
    eventParticipants,
    serverMembers,
    memberHistory,
    welcomeConfig,
    openaimessages,
    guildMembers,
    grognement,
    userCaptchas,
    captchaConfig,
    bumpLogs,
    discordChannels,
    discordThreads,
    discordUsers,
    discordMessages,
    counterState,
    countdownState,
    countdownScores,
    botVersionState,
    discordRoles,
    discordEventsArchive,
    discordEmojis,
    guildSettings,
    featureFlags,
    userWarnings,
    userSanctions,
    modLogs,
    tickets,
    ticketMessages,
    eventLog,
    welcomeCards
};
