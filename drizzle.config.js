/* eslint-disable */
const { defineConfig } = require('drizzle-kit');

const dbUrl = process.env.DATABASE_URL || process.env.DB_URL;
const isTest = process.env.NODE_ENV === 'test';

let dbConfig;
if (dbUrl) {
    dbConfig = { url: dbUrl };
} else if (isTest) {
    dbConfig = { driver: 'pglite' };
} else {
    dbConfig = {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        database: process.env.PG_DATABASE || 'botdb',
        ssl: process.env.PGSSL === 'true' ? 'require' : false
    };
}

module.exports = defineConfig({
    schema: [
        './src/db/schemas/index.js',
        './src/modules/**/db/schema.js'
    ],
    out: './src/db/migrations',
    dialect: 'postgresql',
    dbCredentials: dbConfig,
    verbose: true,
    strict: true
});
