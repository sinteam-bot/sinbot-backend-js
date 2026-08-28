/**
 * db/schemas/_drizzle.js
 *
 * Re-export centralisé des helpers Drizzle pg-core. Centralise les imports
 * pour éviter d'avoir à les dupliquer (et de risquer d'en oublier) dans
 * chaque `db/schema.js` de module.
 *
 * Usage dans un module :
 *   const { pgTable, text, integer, bigint, serial, index, primaryKey } = require('../../db/schemas/_drizzle.js');
 *   const { sql } = require('drizzle-orm');
 */

const pgCore = require('drizzle-orm/pg-core');

module.exports = {
    pgTable: pgCore.pgTable,
    text: pgCore.text,
    integer: pgCore.integer,
    bigint: pgCore.bigint,
    serial: pgCore.serial,
    smallint: pgCore.smallint,
    boolean: pgCore.boolean,
    timestamp: pgCore.timestamp,
    primaryKey: pgCore.primaryKey,
    index: pgCore.index,
    uniqueIndex: pgCore.uniqueIndex,
    unique: pgCore.unique
};
