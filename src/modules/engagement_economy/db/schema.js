/**
 * feature_economy/db/schema.js
 *
 * Tables Drizzle du module Economy (balance, transactions, shop, inventory).
 */

const { pgTable, text, integer, bigint, primaryKey, index } = require('../../../db/schemas/_drizzle.js');

const userEconomy = pgTable('user_economy', {
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
    bankBalance: bigint('bank_balance', { mode: 'number' }).notNull().default(0),
    lastDailyClaimAt: bigint('last_daily_claim_at', { mode: 'number' }),
    totalEarned: bigint('total_earned', { mode: 'number' }).notNull().default(0),
    totalSpent: bigint('total_spent', { mode: 'number' }).notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.userId, table.guildId] }),
    index('idx_pg_user_economy_balance').on(table.guildId, table.balance)
]);

const economyTransactions = pgTable('economy_transactions', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    type: text('type').notNull(),
    counterpartyId: text('counterparty_id'),
    reason: text('reason'),
    metadata: text('metadata'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_economy_tx_user').on(table.guildId, table.userId, table.createdAt),
    index('idx_pg_economy_tx_created').on(table.guildId, table.createdAt)
]);

const shopItems = pgTable('shop_items', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    emoji: text('emoji'),
    price: bigint('price', { mode: 'number' }).notNull(),
    roleRewardId: text('role_reward_id'),
    xpReward: bigint('xp_reward', { mode: 'number' }),
    isTradeable: integer('is_tradeable').notNull().default(1),
    isDroppable: integer('is_droppable').notNull().default(1),
    maxPerUser: integer('max_per_user'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_shop_items_guild').on(table.guildId)
]);

const userInventory = pgTable('user_inventory', {
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    itemId: text('item_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    acquiredAt: bigint('acquired_at', { mode: 'number' }).notNull()
}, (table) => [
    primaryKey({ columns: [table.userId, table.guildId, table.itemId] }),
    index('idx_pg_user_inventory_item').on(table.guildId, table.itemId),
    index('idx_pg_user_inventory_user').on(table.guildId, table.userId)
]);

const inventoryDrops = pgTable('inventory_drops', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id'),
    itemId: text('item_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    startedAt: bigint('started_at', { mode: 'number' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    claimedBy: text('claimed_by'),
    claimedAt: bigint('claimed_at', { mode: 'number' }),
    status: text('status').notNull().default('active')
}, (table) => [
    index('idx_pg_inventory_drops_status').on(table.guildId, table.status, table.expiresAt),
    index('idx_pg_inventory_drops_message').on(table.messageId)
]);

const inventoryTransfers = pgTable('inventory_transfers', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    fromUserId: text('from_user_id').notNull(),
    toUserId: text('to_user_id').notNull(),
    itemId: text('item_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    type: text('type').notNull(),
    price: bigint('price', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pg_inventory_transfers_to').on(table.guildId, table.toUserId, table.createdAt)
]);

module.exports = { userEconomy, economyTransactions, shopItems, userInventory, inventoryDrops, inventoryTransfers };
