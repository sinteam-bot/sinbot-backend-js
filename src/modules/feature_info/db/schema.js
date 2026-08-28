/**
 * db/schema.js — Tables Drizzle propres au module.
 * Étape 2 : stub qui pointe vers le schema global (rétrocompat).
 * Étape 3 : remplacera par des définitions `pgTable` isolées.
 */

const pgSchema = require('../../../db/schema/pg.js');

module.exports = {
    botConfig: pgSchema.botConfig,
    botState: pgSchema.botState,
    authSessions: pgSchema.authSessions,
    authAuditLogs: pgSchema.authAuditLogs,
    authFailedAttempts: pgSchema.authFailedAttempts,
    userProfiles: pgSchema.userProfiles,
};
