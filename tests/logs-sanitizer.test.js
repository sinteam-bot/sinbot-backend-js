/**
const { test, describe, beforeAll, afterAll, beforeEach } = require("vitest");
 * Tests for the Logs feature services
 */

const assert = require('node:assert');
const { Sanitizer } = require('../src/modules/feature_logs/services/sanitizer.service.js');

describe('Sanitizer', () => {
    let s;
    beforeEach(() => {
        s = new Sanitizer({ max_content_length: 100, whitelist_domains: ['github.com'] });
    });

    test('cleanContent renvoie vide pour null', () => {
        assert.strictEqual(s.cleanContent(null), '');
        assert.strictEqual(s.cleanContent(undefined), '');
        assert.strictEqual(s.cleanContent(''), '');
    });

    test('cleanContent préserve le texte brut', () => {
        assert.strictEqual(s.cleanContent('salut les amis'), 'salut les amis');
    });

    test('cleanContent masque les URLs hors whitelist', () => {
        const r = s.cleanContent('va sur https://malicious.com/truc');
        assert.ok(r.includes('<lien masqué>'));
    });

    test('cleanContent préserve les URLs whitelistées', () => {
        const r = s.cleanContent('repo https://github.com/user/repo ici');
        assert.ok(r.includes('https://github.com/user/repo'));
    });

    test('cleanContent tronque au-delà de max_length', () => {
        const long = 'a'.repeat(200);
        const r = s.cleanContent(long);
        assert.ok(r.length <= 100);
        assert.ok(r.endsWith('...'));
    });

    test('cleanContent gère les URLs invalides', () => {
        const r = s.cleanContent('teste https://malformed');
        assert.ok(r.includes('<lien masqué>'));
    });

    test('describeAttachments retourne un tableau', () => {
        assert.deepStrictEqual(s.describeAttachments([]), []);
        assert.deepStrictEqual(s.describeAttachments(null), []);
        const r = s.describeAttachments([{ name: 'photo.png', url: 'http://secret/x', contentType: 'image/png', size: 1234 }]);
        assert.strictEqual(r.length, 1);
        assert.strictEqual(r[0].name, 'photo.png');
        assert.ok(!('url' in r[0]));
    });

    test('cleanUsername enlève les caractères spéciaux', () => {
        assert.strictEqual(s.cleanUsername('hello*world'), 'helloworld');
        assert.strictEqual(s.cleanUsername('test`code'), 'testcode');
    });

    test('truncate avec ellipsis', () => {
        assert.strictEqual(s.truncate('hello world', 5), 'hell…');
        assert.strictEqual(s.truncate('hi', 10), 'hi');
    });

    test('setConfig met à jour maxLength', () => {
        s.setConfig({ settings: { max_content_length: 50 } });
        assert.strictEqual(s.maxLength, 50);
    });
});
