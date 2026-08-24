const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { migrateSqliteToPostgres } = require('../scripts/migrate-sqlite-to-postgres.js');

describe('SQLite to PostgreSQL Migration Script Tests', () => {
    test('Dry run on existing SQLite database', async () => {
        const sqlitePath = path.resolve(__dirname, '../data/bot.db');
        
        // Exécuter en mode dry-run sans toucher à PostgreSQL
        const stats = await migrateSqliteToPostgres({
            sqlitePath,
            dryRun: true,
            silent: true
        });

        assert.ok(stats, 'Stats must be returned');
        assert.ok(typeof stats.totalRows === 'number');
        assert.ok(stats.totalRows >= 0);
        assert.ok(stats.durationMs >= 0);
        assert.ok(Array.isArray(stats.migratedTables));
        assert.ok(stats.migratedTables.length > 0);
    });

    test('Dry run filtered by specific table', async () => {
        const sqlitePath = path.resolve(__dirname, '../data/bot.db');

        const stats = await migrateSqliteToPostgres({
            sqlitePath,
            tableFilter: 'bot_config',
            dryRun: true,
            silent: true
        });

        assert.ok(stats);
        assert.strictEqual(stats.migratedTables.length, 1);
        assert.strictEqual(stats.migratedTables[0], 'bot_config');
    });
});
