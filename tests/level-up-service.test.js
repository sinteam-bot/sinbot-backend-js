/**
const { test, describe, beforeAll, afterAll, beforeEach } = require("vitest");
 * Tests pour le LevelUpService et le nouveau flow XP
 */

const assert = require('node:assert');
const { LevelUpService } = require('../src/modules/feature_xp-level/level-up.service.js');

describe('LevelUpService', () => {
    test('isEnabled suit la config', () => {
        const s = new LevelUpService();
        assert.strictEqual(s.isEnabled(), false);
        s.setConfig({ enabled: true });
        assert.strictEqual(s.isEnabled(), true);
    });

    test('mergeDefaults remplit les valeurs par défaut', () => {
        const s = new LevelUpService();
        s.setConfig({});
        assert.strictEqual(s._config.enabled, true);
        assert.strictEqual(s._config.ping_user, true);
        assert.ok(s._config.template.includes('{user}'));
    });

    test('buildEmbed rend le template et les placeholders', () => {
        const s = new LevelUpService();
        s.setConfig({ template: 'GG {user} niv {level} (rang {rank})', show_rank: true });
        const user = { id: 'u1', username: 'alice', displayAvatarURL: () => 'http://avatar' };
        const embed = s.buildEmbed({ user, level: 5, totalXp: 1000, rank: 3 });
        const desc = embed.data.description;
        assert.ok(desc.includes('<@u1>'));
        assert.ok(desc.includes('niv 5'));
        assert.ok(desc.includes('rang #3'));
    });

    test('applyRewardRoles cumulable=true ajoute sans retirer', async () => {
        const s = new LevelUpService();
        const added = [];
        const member = {
            roles: {
                cache: new Map(),
                add: async (rid) => { added.push(rid); }
            }
        };
        const guild = { id: 'g1', roles: { cache: new Map() } };
        // Au niveau 25, les deux paliers (5 et 20) sont atteints
        const r = await s.applyRewardRoles(guild, member, 25, { 5: 'role_5', 20: 'role_20' }, { cumulable: true });
        assert.deepStrictEqual(added.sort(), ['role_20', 'role_5'].sort());
        assert.strictEqual(r.added.length, 2);
        assert.strictEqual(r.removed.length, 0);
    });

    test('applyRewardRoles cumulable=false retire les rôles au-dessus du niveau', async () => {
        const s = new LevelUpService();
        const added = [], removed = [];
        const member = {
            roles: {
                cache: new Map([['role_5', {}], ['role_20', {}]]),
                add: async (rid) => { added.push(rid); },
                remove: async (rid) => { removed.push(rid); }
            }
        };
        const guild = { id: 'g1', roles: { cache: new Map() } };
        const r = await s.applyRewardRoles(guild, member, 3, { 5: 'role_5', 20: 'role_20' }, { cumulable: false });
        assert.strictEqual(added.length, 0);
        assert.deepStrictEqual(removed.sort(), ['role_20', 'role_5'].sort());
    });

    test('renderTemplate gère les placeholders manquants gracieusement', () => {
        const s = new LevelUpService();
        s.setConfig({ template: 'X {user} {level} {unknown}' });
        const embed = s.buildEmbed({ user: { id: 'u', username: 'n', displayAvatarURL: null }, level: 1 });
        assert.ok(embed.data.description.includes('X <@u> 1'));
    });
});
