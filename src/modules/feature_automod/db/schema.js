/**
 * db/schema.js — Tables Drizzle propres au module.
 * Étape 2 : stub qui pointe vers le schema global (rétrocompat).
 * Étape 3 : remplacera par des définitions `pgTable` isolées.
 */

const pgSchema = require('../../../db/schema/pg.js');

module.exports = {
    userWarnings: pgSchema.userWarnings,
    userSanctions: pgSchema.userSanctions,
    modLogs: pgSchema.modLogs,
};
