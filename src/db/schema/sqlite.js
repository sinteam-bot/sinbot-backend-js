const { sqliteTable, text, integer, primaryKey, index, uniqueIndex } = require('drizzle-orm/sqlite-core');
const { sql } = require('drizzle-orm');

// 1. user_events
const userEvents = sqliteTable('user_events', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    eventType: text('event_type').notNull(),
    eventData: text('event_data'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 2. form_responses
const formResponses = sqliteTable('form_responses', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    formName: text('form_name').notNull(),
    responses: text('responses'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 3. user_birthdays
const userBirthdays = sqliteTable('user_birthdays', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    birthdate: text('birthdate').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 4. user_xp
const userXp = sqliteTable('user_xp', {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
const xpTransactions = sqliteTable('xp_transactions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    xpAmount: integer('xp_amount').notNull(),
    xpType: text('xp_type').notNull(),
    description: text('description'),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 6. voice_sessions
const voiceSessions = sqliteTable('voice_sessions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
const events = sqliteTable('events', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventName: text('event_name').notNull(),
    eventDescription: text('event_description'),
    eventDate: text('event_date'),
    xpReward: integer('xp_reward').default(0),
    createdBy: text('created_by'),
    isActive: integer('is_active').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 8. event_participants
const eventParticipants = sqliteTable('event_participants', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: integer('event_id').notNull(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    xpEarned: integer('xp_earned').default(0),
    joinedAt: text('joined_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
    uniqueIndex('idx_event_user').on(table.eventId, table.userId)
]);

// 9. server_members
const serverMembers = sqliteTable('server_members', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    discriminator: text('discriminator'),
    tag: text('tag'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    joinedAt: text('joined_at'),
    accountCreatedAt: text('account_created_at'),
    isBot: integer('is_bot').default(0),
    rejoinCount: integer('rejoin_count').default(0),
    leftAt: text('left_at'),
    roles: text('roles'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 10. member_history
const memberHistory = sqliteTable('member_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    action: text('action').notNull(),
    guildId: text('guild_id').notNull(),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 11. welcome_config
const welcomeConfig = sqliteTable('welcome_config', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id').notNull().unique(),
    welcomeChannelId: text('welcome_channel_id'),
    welcomeMessage: text('welcome_message'),
    autoRoles: text('auto_roles'),
    isEnabled: integer('is_enabled').default(1),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 12. openaimessages
const openaimessages = sqliteTable('openaimessages', {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
const guildMembers = sqliteTable('guild_members', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 14. grognement
const grognement = sqliteTable('grognement', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 15. user_captchas
const userCaptchas = sqliteTable('user_captchas', {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
    uniqueIndex('idx_user_guild_captcha').on(table.userId, table.guildId)
]);

// 16. captcha_config
const captchaConfig = sqliteTable('captcha_config', {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
const bumpLogs = sqliteTable('bump_logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    userId: text('user_id'),
    username: text('username'),
    bumpedAt: text('bumped_at').default(sql`CURRENT_TIMESTAMP`),
    reminderSent: integer('reminder_sent').default(0),
    reminderSentAt: text('reminder_sent_at')
});

// 18. discord_channels
const discordChannels = sqliteTable('discord_channels', {
    channelId: text('channel_id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    parentId: text('parent_id'),
    position: integer('position').default(0),
    topic: text('topic'),
    isNsfw: integer('is_nsfw').default(0),
    createdAt: text('created_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 19. discord_threads
const discordThreads = sqliteTable('discord_threads', {
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
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 20. discord_users
const discordUsers = sqliteTable('discord_users', {
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
const discordMessages = sqliteTable('discord_messages', {
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
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 22. counter_state
const counterState = sqliteTable('counter_state', {
    channelId: text('channel_id').primaryKey(),
    currentNumber: integer('current_number').default(0),
    lastUserId: text('last_user_id'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 23. countdown_state
const countdownState = sqliteTable('countdown_state', {
    channelId: text('channel_id').primaryKey(),
    currentNumber: integer('current_number').default(900),
    isTrapActive: integer('is_trap_active').default(0),
    trapNumber: integer('trap_number'),
    lastUserId: text('last_user_id'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 24. countdown_scores
const countdownScores = sqliteTable('countdown_scores', {
    channelId: text('channel_id').notNull(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    score: integer('score').default(0)
}, (table) => [
    primaryKey({ columns: [table.channelId, table.userId] })
]);

// 25. bot_version_state
const botVersionState = sqliteTable('bot_version_state', {
    key: text('key').primaryKey(),
    value: text('value'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 26. discord_roles
const discordRoles = sqliteTable('discord_roles', {
    roleId: text('role_id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    color: integer('color').default(0),
    hoist: integer('hoist').default(0),
    position: integer('position').default(0),
    permissions: text('permissions'),
    managed: integer('managed').default(0),
    mentionable: integer('mentionable').default(0),
    createdAt: text('created_at'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 27. discord_events_archive
const discordEventsArchive = sqliteTable('discord_events_archive', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventName: text('event_name').notNull(),
    guildId: text('guild_id'),
    targetId: text('target_id'),
    userId: text('user_id'),
    username: text('username'),
    summary: text('summary'),
    dataJson: text('data_json'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
    index('idx_events_name').on(table.eventName),
    index('idx_events_created').on(table.createdAt)
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
    discordEventsArchive
};
