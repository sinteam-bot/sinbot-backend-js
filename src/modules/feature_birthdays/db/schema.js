/**
 * src/modules/feature_birthdays/db/schema.js
 *
 * Tables Drizzle propres au module Birthdays.
 * Réexporte les définitions existantes depuis le schema global (étape 2) ;
 * sera isolé proprement en étape 3.
 */

const pgSchema = require('../../../db/schema/pg.js');

module.exports = {
    userBirthdays: pgSchema.userBirthdays,
    birthdayGuildSettings: pgSchema.birthdayGuildSettings,
    birthdayVisibility: pgSchema.birthdayVisibility,
    birthdayChangeLog: pgSchema.birthdayChangeLog,
    birthdayHistory: pgSchema.birthdayHistory
};
