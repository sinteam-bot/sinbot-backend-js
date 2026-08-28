/**
 * db/schema.js — Tables Drizzle propres au module.
 * Étape 2 : stub qui pointe vers le schema global (rétrocompat).
 * Étape 3 : remplacera par des définitions `pgTable` isolées.
 */

const pgSchema = require('../../../db/schema/pg.js');

module.exports = {
    userEconomy: pgSchema.userEconomy,
    economyTransactions: pgSchema.economyTransactions,
    shopItems: pgSchema.shopItems,
    userInventory: pgSchema.userInventory,
    inventoryDrops: pgSchema.inventoryDrops,
    inventoryTransfers: pgSchema.inventoryTransfers,
};
