/**
 * db/schemas/shared/cache.js
 *
 * Cache des entités Discord (synchronisé via `DiscordCacheService`)
 * + tables utilitaires (grognement, guild_members, guild_stats).
 *
 * Ces tables sont transverses : elles sont lues par plusieurs modules
 * (feature_logs, feature_info, dashboard, etc.).
 */

const { pgTable, text, integer, bigint, serial, primaryKey, index } = require('../_drizzle.js');
const { sql } = require('drizzle-orm');

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

const memberHistory = pgTable('member_history', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    action: text('action').notNull(),
    guildId: text('guild_id').notNull(),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

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

const guildMembers = pgTable('guild_members', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

const grognement = pgTable('grognement', {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

const guildStats = pgTable('guild_stats', {
    guildId: text('guild_id').notNull(),
    statKey: text('stat_key').notNull(),
    statValue: text('stat_value').notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.guildId, table.statKey] })
]);

module.exports = {
    serverMembers, memberHistory,
    discordChannels, discordThreads, discordUsers, discordMessages, discordRoles, discordEmojis,
    guildMembers, grognement, guildStats
};
