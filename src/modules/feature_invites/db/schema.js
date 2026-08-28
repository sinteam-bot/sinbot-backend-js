/**
 * feature_invites/db/schema.js
 *
 * Tables Drizzle du feature Invites (InviteLogger-like).
 *  - invite_codes : cache des invites Discord par guilde
 *  - invite_uses : table de faits (qui a invité qui, à quelle date)
 *  - invite_bonuses : bonus accordés par les admins
 *  - invite_blacklist : users/rôles exclus du leaderboard
 *  - invite_restore : snapshot pour /restoreInvites
 */

const { pgTable, text, integer, bigint, index, primaryKey, uniqueIndex } = require('../../../db/schemas/_drizzle.js');

const inviteCodes = pgTable('invite_codes', {
    code: text('code').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id'),
    inviterId: text('inviter_id'),
    inviterUsername: text('inviter_username'),
    maxUses: integer('max_uses').default(0),
    uses: integer('uses').default(0),
    expiresAt: text('expires_at'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
    deleted: integer('deleted').notNull().default(0)
}, (table) => [
    index('idx_invite_codes_guild').on(table.guildId, table.deleted)
]);

const inviteUses = pgTable('invite_uses', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    inviteCode: text('invite_code').notNull(),
    inviterId: text('inviter_id').notNull(),
    inviterUsername: text('inviter_username'),
    invitedId: text('invited_id').notNull(),
    invitedUsername: text('invited_username').notNull(),
    joinedAt: bigint('joined_at', { mode: 'number' }).notNull(),
    leftAt: bigint('left_at', { mode: 'number' }),
    isFake: integer('is_fake').notNull().default(0),
    fakeReason: text('fake_reason'),
    isBot: integer('is_bot').notNull().default(0),
    isVanity: integer('is_vanity').notNull().default(0)
}, (table) => [
    index('idx_invite_uses_guild_inviter').on(table.guildId, table.inviterId, table.joinedAt),
    index('idx_invite_uses_guild_invited').on(table.guildId, table.invitedId),
    index('idx_invite_uses_invite_code').on(table.inviteCode)
]);

const inviteBonuses = pgTable('invite_bonuses', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    amount: integer('amount').notNull(),
    reason: text('reason'),
    moderatorId: text('moderator_id'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_invite_bonuses_guild_user').on(table.guildId, table.userId, table.createdAt)
]);

const inviteBlacklist = pgTable('invite_blacklist', {
    guildId: text('guild_id').notNull(),
    targetId: text('target_id').notNull(),
    targetType: text('target_type').notNull(),
    reason: text('reason'),
    moderatorId: text('moderator_id'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.guildId, table.targetId] }),
    index('idx_invite_blacklist_guild').on(table.guildId)
]);

const inviteRestore = pgTable('invite_restore', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    totalInvites: integer('total_invites').notNull().default(0),
    realInvites: integer('real_invites').notNull().default(0),
    bonusInvites: integer('bonus_invites').notNull().default(0),
    leaves: integer('leaves').notNull().default(0),
    snapshotAt: bigint('snapshot_at', { mode: 'number' }).notNull(),
    restoredAt: bigint('restored_at', { mode: 'number' })
}, (table) => [
    index('idx_invite_restore_guild_user').on(table.guildId, table.userId, table.snapshotAt)
]);

module.exports = {
    inviteCodes,
    inviteUses,
    inviteBonuses,
    inviteBlacklist,
    inviteRestore
};
