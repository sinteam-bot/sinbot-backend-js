/**
const { test, describe, beforeEach, afterEach } = require('node:test');
 * Tests for the InfoService (Phase 8.3)
 */

const assert = require('node:assert');
const { InfoService } = require('../src/modules/feature_info/services/info.service.js');

function makeGuild(opts = {}) {
    return {
        id: opts.id || 'g1',
        name: opts.name || 'Test Guild',
        memberCount: opts.memberCount ?? 42,
        ownerId: opts.ownerId || 'owner1',
        createdAt: opts.createdAt || new Date('2024-01-15T00:00:00Z'),
        iconURL: opts.iconURL || (() => 'https://example.com/icon.png'),
        bannerURL: opts.bannerURL || (() => null),
        channels: opts.channels || { cache: { size: 5 } },
        roles: opts.roles || { cache: { size: 8 } },
        emojis: opts.emojis || { cache: { size: 12 } },
        features: opts.features || ['COMMUNITY', 'NEWS']
    };
}

function makeUser(opts = {}) {
    return {
        id: opts.id || 'u1',
        username: opts.username || 'alice',
        globalName: opts.globalName || 'Alice',
        bot: opts.bot || false,
        displayAvatarURL: opts.displayAvatarURL || (() => 'https://example.com/avatar.png'),
        accentColor: opts.accentColor,
        createdTimestamp: opts.createdTimestamp || 1700000000000
    };
}

describe('InfoService', () => {
    let svc;
    beforeEach(() => { svc = new InfoService(); });

    test('buildServerEmbed inclut les infos clés', () => {
        const guild = makeGuild();
        const embed = svc.buildServerEmbed(guild, { color: '#5865F2', footer: 'Test', show_id: true });
        assert.strictEqual(embed.data.title, '🏛️ Test Guild');
        const fieldNames = embed.data.fields.map(f => f.name);
        assert.ok(fieldNames.includes('👥 Membres'));
        assert.ok(fieldNames.includes('📅 Créé le'));
        assert.ok(fieldNames.includes('👑 Propriétaire'));
        assert.ok(fieldNames.includes('📝 Salons'));
        assert.ok(fieldNames.includes('🎭 Rôles'));
        assert.ok(fieldNames.includes('😀 Emojis'));
        assert.ok(fieldNames.includes('🆔 ID'));
    });

    test('buildServerEmbed cache l\'ID si show_id=false', () => {
        const embed = svc.buildServerEmbed(makeGuild(), { show_id: false });
        const fieldNames = embed.data.fields.map(f => f.name);
        assert.ok(!fieldNames.includes('🆔 ID'));
    });

    test('buildUserEmbed inclut les infos user + member', () => {
        const user = makeUser();
        const member = {
            joinedAt: new Date('2024-06-01T00:00:00Z'),
            roles: {
                cache: new Map([
                    ['g1', { id: 'g1', name: '@everyone', position: 0 }],
                    ['r1', { id: 'r1', name: 'Member', position: 50 }]
                ])
            }
        };
        const embed = svc.buildUserEmbed(user, member, { show_id: true });
        assert.strictEqual(embed.data.title, '👤 Alice');
        const fieldNames = embed.data.fields.map(f => f.name);
        assert.ok(fieldNames.includes('📛 Pseudo'));
        assert.ok(fieldNames.includes('🤖 Type'));
        assert.ok(fieldNames.includes('📅 Compte créé'));
        assert.ok(fieldNames.includes('🚪 Rejoint le'));
        assert.ok(fieldNames.includes('🎭 Rôles (1)'));
        assert.ok(fieldNames.includes('🆔 ID'));
    });

    test('buildUserEmbed sans member : pas de section roles', () => {
        const user = makeUser();
        const embed = svc.buildUserEmbed(user, null, {});
        const fieldNames = embed.data.fields.map(f => f.name);
        assert.ok(!fieldNames.includes('🚪 Rejoint le'));
        assert.ok(!fieldNames.includes('🎭 Rôles'));
    });

    test('buildUserEmbed signale un bot', () => {
        const user = makeUser({ bot: true, username: 'TestBot' });
        const embed = svc.buildUserEmbed(user, null, {});
        const typeField = embed.data.fields.find(f => f.name === '🤖 Type');
        assert.strictEqual(typeField.value, 'Bot');
    });

    test('getAvatarUrl retourne l\'URL du user', () => {
        const user = makeUser();
        const url = svc.getAvatarUrl(user, { size: 256 });
        assert.strictEqual(url, 'https://example.com/avatar.png');
    });

    test('getAvatarUrl retourne null si pas d\'avatar', () => {
        const user = { id: 'u1', displayAvatarURL: null };
        assert.strictEqual(svc.getAvatarUrl(user), null);
    });

    test('buildServerEmbed format la date correctement', () => {
        const guild = makeGuild({ createdAt: new Date('2024-01-15T00:00:00Z') });
        const embed = svc.buildServerEmbed(guild, {});
        const dateField = embed.data.fields.find(f => f.name === '📅 Créé le');
        assert.ok(dateField.value.startsWith('<t:'));
    });
});
