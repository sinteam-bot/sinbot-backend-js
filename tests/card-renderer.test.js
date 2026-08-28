/**
 * Tests for the CardRendererService (Phase 6)
 */

const assert = require('node:assert');
const { CardRendererService } = require('../src/modules/feature_cards/services/card-renderer.service.js');

describe('CardRendererService', () => {
    let svc;
    beforeEach(() => { svc = new CardRendererService(); });

    test('listTemplates retourne les templates built-in', () => {
        const list = svc.listTemplates();
        assert.ok(list.includes('welcome'));
        assert.ok(list.includes('join'));
        assert.ok(list.includes('leave'));
        assert.ok(list.includes('level_up'));
        assert.ok(list.includes('giveaway'));
        assert.ok(list.includes('generic'));
    });

    test('render retourne une chaîne SVG valide', () => {
        const svg = svc.render('welcome', { username: 'alice', server: 'Test' });
        assert.ok(svg.startsWith('<svg'));
        assert.ok(svg.endsWith('</svg>'));
        assert.ok(svg.includes('alice'));
        assert.ok(svg.includes('Test'));
    });

    test('render échappe le XML pour éviter les injections', () => {
        const svg = svc.render('welcome', { username: '<script>alert(1)</script>' });
        assert.ok(!svg.includes('<script>'));
        assert.ok(svg.includes('&lt;script&gt;'));
    });

    test('render échappe les guillemets et esperluettes', () => {
        const svg = svc.render('welcome', { username: 'A & B "C"' });
        assert.ok(svg.includes('A &amp; B &quot;C&quot;'));
    });

    test('render rejette un template inconnu', () => {
        assert.throws(() => svc.render('nope'), /Template inconnu/);
    });

    test('renderToBuffer retourne un Buffer UTF-8', () => {
        const buf = svc.renderToBuffer('welcome', { username: 'bob' });
        assert.ok(Buffer.isBuffer(buf));
        const s = buf.toString('utf-8');
        assert.ok(s.startsWith('<svg'));
        assert.ok(s.includes('bob'));
    });

    test('hashPayload est déterministe', () => {
        const h1 = svc.hashPayload({ a: 1, b: 'x' });
        const h2 = svc.hashPayload({ a: 1, b: 'x' });
        assert.strictEqual(h1, h2);
    });

    test('hashPayload diffère pour un payload différent', () => {
        const h1 = svc.hashPayload({ a: 1 });
        const h2 = svc.hashPayload({ a: 2 });
        assert.notStrictEqual(h1, h2);
    });

    test('registerTemplate permet d\'ajouter un template custom', () => {
        svc.registerTemplate('custom', (p, { width, height }) => `<svg width="${width}" height="${height}">${p.text}</svg>`);
        const list = svc.listTemplates();
        assert.ok(list.includes('custom'));
        const svg = svc.render('custom', { text: 'hello' });
        assert.ok(svg.includes('hello'));
    });

    test('template level_up inclut une progress bar', () => {
        const svg = svc.render('level_up', { username: 'alice', level: 5, progressPercent: 42 });
        assert.ok(svg.includes('<rect'));
        assert.ok(svg.includes('42%'));
    });

    test('template giveaway affiche le lot et le host', () => {
        const svg = svc.render('giveaway', { prize: 'Nitro', host: 'Staff', winnersCount: 1, endsAt: 'demain 18h' });
        assert.ok(svg.includes('Nitro'));
        assert.ok(svg.includes('Staff'));
    });

    test('template join/leave avec couleurs différentes', () => {
        const join = svc.render('join', { username: 'X', memberCount: 100 });
        const leave = svc.render('leave', { username: 'X' });
        assert.ok(join.includes('Nouveau membre'));
        assert.ok(leave.includes('Départ'));
        assert.ok(join.includes('#57f287'));
        assert.ok(leave.includes('#ed4245'));
    });

    test('template generic avec avatar', () => {
        const svg = svc.render('generic', {
            title: 'Custom Title',
            subtitle: 'Custom Sub',
            avatarUrl: 'https://example.com/avatar.png'
        });
        assert.ok(svg.includes('Custom Title'));
        assert.ok(svg.includes('https://example.com/avatar.png'));
    });

    test('le rendu tronque les strings > 200 chars', () => {
        const long = 'X'.repeat(500);
        const svg = svc.render('welcome', { username: long });
        assert.ok(!svg.includes('X'.repeat(250)));
    });

    test('dimensions personnalisables', () => {
        const svg = svc.render('welcome', {}, { width: 800, height: 400 });
        assert.ok(svg.includes('viewBox="0 0 800 400"'));
        assert.ok(svg.includes('width="800"'));
    });

    test('payload avec avatar manquant affiche un placeholder', () => {
        const svg = svc.render('welcome', { username: 'A' });
        assert.ok(svg.includes('<!-- no avatar placeholder -->') || svg.includes('<circle') || svg.includes('?'));
    });
});
