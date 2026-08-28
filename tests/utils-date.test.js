const assert = require('node:assert');
const { test, describe, beforeAll, afterAll, beforeEach } = require("vitest");
const {
    getCurrentTimestamp,
    toISOStringSafe,
    formatToParisDate,
    formatToParisTime,
    calculateDurationMinutes,
    toTimestamp,
    getCurrentParisDateString,
    parseToDate
} = require('../src/utils/dateUtils.js');

describe('Date Utilities Tests', () => {
    test('getCurrentTimestamp: should return valid ISO date string', () => {
        const ts = getCurrentTimestamp();
        assert.ok(typeof ts === 'string');
        assert.ok(ts.includes('T'));
        const parsed = new Date(ts);
        assert.ok(!isNaN(parsed.getTime()));
    });

    test('toISOStringSafe: handles Date objects, strings, numbers and invalid dates safely', () => {
        const d = new Date('2026-08-24T12:00:00.000Z');
        assert.strictEqual(toISOStringSafe(d), '2026-08-24T12:00:00.000Z');
        assert.strictEqual(toISOStringSafe('2026-08-24T12:00:00.000Z'), '2026-08-24T12:00:00.000Z');
        assert.ok(toISOStringSafe(d.getTime()).startsWith('2026-08-24'));
        
        // Null / undefined with fallback
        assert.strictEqual(toISOStringSafe(null), null);
        assert.strictEqual(toISOStringSafe(null, 'fallback-iso'), 'fallback-iso');
    });

    test('formatToParisDate: formats date into French localized format', () => {
        const d = new Date('2026-08-24T10:00:00.000Z');
        const formatted = formatToParisDate(d);
        assert.ok(formatted.includes('24/08/2026') || formatted.includes('24/08/26'));
    });

    test('formatToParisTime: formats date into French localized time', () => {
        const d = new Date('2026-08-24T10:00:00.000Z');
        const formatted = formatToParisTime(d);
        assert.ok(typeof formatted === 'string');
        assert.ok(formatted.includes(':'));
    });

    test('calculateDurationMinutes: accurately calculates minutes between dates', () => {
        const start = new Date('2026-08-24T10:00:00.000Z');
        const end = new Date('2026-08-24T10:45:00.000Z');
        const diff = calculateDurationMinutes(start, end);
        assert.strictEqual(diff, 45);

        // Negative difference or invalid date defaults safely
        assert.strictEqual(calculateDurationMinutes(end, start), 0);
    });

    test('toTimestamp: converts various date representations to numeric ms', () => {
        const now = Date.now();
        const d = new Date(now);
        assert.strictEqual(toTimestamp(d), now);
        assert.strictEqual(toTimestamp(now), now);
        assert.ok(toTimestamp('invalid') > 0);
    });

    test('getCurrentParisDateString: returns YYYY-MM-DD format', () => {
        const parisDate = getCurrentParisDateString();
        assert.match(parisDate, /^\d{4}-\d{2}-\d{2}$/);
    });

    test('parseToDate: safely converts strings to Date objects', () => {
        const d = parseToDate('2026-08-24T10:00:00.000Z');
        assert.ok(d instanceof Date);
        assert.strictEqual(d.toISOString(), '2026-08-24T10:00:00.000Z');
    });
});
