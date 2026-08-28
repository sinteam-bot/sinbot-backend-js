/**
 * Tests unitaires pour les services AutoMod
 */

const assert = require('node:assert');
const { SpamDetector } = require('../src/modules/feature_automod/services/spam-detector.service.js');
const { BadWords } = require('../src/modules/feature_automod/services/bad-words.service.js');
const { parseDuration } = require('../src/modules/feature_automod/services/sanctions.service.js');

describe('SpamDetector', () => {
    test('détecte un rate de messages', () => {
        const d = new SpamDetector();
        const cfg = { max_messages: 3, window_seconds: 5, max_mentions: 3, mentions_window_seconds: 10 };
        const r1 = d.checkMessage('g1', 'u1', { content: 'spam', mentions: { users: { size: 0 } } }, cfg);
        const r2 = d.checkMessage('g1', 'u1', { content: 'spam', mentions: { users: { size: 0 } } }, cfg);
        assert.strictEqual(r1.spam, false);
        assert.strictEqual(r2.spam, false);
        const r3 = d.checkMessage('g1', 'u1', { content: 'spam', mentions: { users: { size: 0 } } }, cfg);
        assert.strictEqual(r3.spam, true);
        assert.strictEqual(r3.reason, 'rate');
    });

    test('reset efface l\'historique', () => {
        const d = new SpamDetector();
        const cfg = { max_messages: 1, window_seconds: 5, max_mentions: 0, mentions_window_seconds: 1 };
        d.checkMessage('g1', 'u1', { content: 'x', mentions: { users: { size: 0 } } }, cfg);
        d.reset();
        const r = d.checkMessage('g1', 'u1', { content: 'x', mentions: { users: { size: 0 } } }, { max_messages: 2, window_seconds: 5, max_mentions: 0, mentions_window_seconds: 1 });
        assert.strictEqual(r.spam, false);
    });

    test('les guilds sont isolés', () => {
        const d = new SpamDetector();
        const cfg = { max_messages: 2, window_seconds: 5, max_mentions: 0, mentions_window_seconds: 1 };
        d.checkMessage('g1', 'u1', { content: 'x', mentions: { users: { size: 0 } } }, cfg);
        const r = d.checkMessage('g2', 'u1', { content: 'x', mentions: { users: { size: 0 } } }, cfg);
        assert.strictEqual(r.spam, false);
    });
});

describe('BadWords', () => {
    test('détecte un mot interdit (whole word)', () => {
        const b = new BadWords();
        const r = b.check('salut connard', { list: ['connard'], whole_word: true, case_sensitive: false });
        assert.strictEqual(r.matched, true);
        assert.strictEqual(r.word, 'connard');
    });

    test('respecte whole_word', () => {
        const b = new BadWords();
        const r = b.check('salut connexion', { list: ['conn'], whole_word: true, case_sensitive: false });
        assert.strictEqual(r.matched, false);
    });

    test('case_sensitive fonctionne', () => {
        const b = new BadWords();
        const r1 = b.check('BAD', { list: ['bad'], whole_word: true, case_sensitive: false });
        assert.strictEqual(r1.matched, true);
        b.reset();
        const r2 = b.check('BAD', { list: ['bad'], whole_word: true, case_sensitive: true });
        assert.strictEqual(r2.matched, false);
    });

    test('échappe les caractères spéciaux', () => {
        const b = new BadWords();
        const r = b.check('a.b.c', { list: ['a.b.c'], whole_word: false, case_sensitive: true });
        assert.strictEqual(r.matched, true);
    });

    test('liste vide retourne matched=false', () => {
        const b = new BadWords();
        const r = b.check('anything', { list: [], whole_word: true, case_sensitive: false });
        assert.strictEqual(r.matched, false);
    });

    test('isEnabled est false si liste vide', () => {
        const b = new BadWords();
        assert.strictEqual(b.isEnabled({ list: [] }), false);
        assert.strictEqual(b.isEnabled({ list: ['x'] }), true);
    });
});

describe('parseDuration', () => {
    test('parse s, m, h, d', () => {
        assert.strictEqual(parseDuration('30s'), 30_000);
        assert.strictEqual(parseDuration('5m'), 300_000);
        assert.strictEqual(parseDuration('1h'), 3_600_000);
        assert.strictEqual(parseDuration('2d'), 172_800_000);
    });

    test('retourne null pour format invalide', () => {
        assert.strictEqual(parseDuration('abc'), null);
        assert.strictEqual(parseDuration(''), null);
        assert.strictEqual(parseDuration(null), null);
    });
});
