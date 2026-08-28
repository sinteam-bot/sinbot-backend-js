/**
 * Tests pour le FeatureRegistry
 *
 * Couvre :
 *  - define + list
 *  - get avec fallback YAML
 *  - get avec DB prioritaire
 *  - set (upsert) et hooks onEnable/onDisable
 *  - canUse (sans restrictions, avec rôles, feature désactivée)
 *  - listForGuild
 */

const assert = require('node:assert');
const { FeatureRegistry, featureRegistry } = require('../src/core/feature-registry.js');

describe('FeatureRegistry', () => {
    let registry;

    beforeEach(() => {
        registry = new FeatureRegistry();
    });

    describe('define / list', () => {
        test('define enregistre une feature', () => {
            registry.define('test_feat', { defaults: { enabled: false, foo: 'bar' } });
            const list = registry.list();
            assert.strictEqual(list.length, 1);
            assert.strictEqual(list[0].name, 'test_feat');
            assert.deepStrictEqual(list[0].defaults, { enabled: false, foo: 'bar' });
        });

        test('define accepte des defaults vides', () => {
            registry.define('empty_feat');
            const list = registry.list();
            assert.strictEqual(list[0].defaults.enabled, false);
        });
    });

    describe('get (fallback)', () => {
        test('retourne les defaults si pas de DB ni YAML', async () => {
            registry.define('my_feat', { defaults: { enabled: true, max: 5 } });
            const state = await registry.get('guild-1', 'my_feat');
            assert.strictEqual(state.enabled, true);
            assert.strictEqual(state.config.max, 5);
            assert.strictEqual(state.source, 'default');
            assert.deepStrictEqual(state.allowedRoles, []);
        });

        test('retourne un état désactivé pour une feature inconnue', async () => {
            const state = await registry.get('guild-1', 'unknown');
            assert.strictEqual(state.enabled, false);
            assert.strictEqual(state.source, 'default');
        });
    });

    describe('canUse', () => {
        test('refuse si la feature est désactivée', async () => {
            registry.define('f1', { defaults: { enabled: false, allowed_roles: [] } });
            const r = await registry.canUse('guild-1', 'user-1', 'f1');
            assert.strictEqual(r.allowed, false);
            assert.strictEqual(r.reason, 'disabled');
        });

        test('autorise si la feature est activée sans restriction de rôles', async () => {
            registry.define('f2', { defaults: { enabled: true, allowed_roles: [] } });
            const r = await registry.canUse('guild-1', 'user-1', 'f2');
            assert.strictEqual(r.allowed, true);
        });

        test('autorise si pas de contexte client (fallback permissif)', async () => {
            registry.define('f3', { defaults: { enabled: true, allowed_roles: ['ROLE_X'] } });
            const r = await registry.canUse('guild-1', 'user-1', 'f3');
            assert.strictEqual(r.allowed, true);
        });
    });

    describe('set (sans DB)', () => {
        test('set appelle onEnable quand on active', async () => {
            let enabledFired = false;
            registry.define('toggle', {
                defaults: { enabled: false },
                onEnable: async (guildId) => { enabledFired = true; }
            });
            registry._dbAvailable = false;
            await registry.set('guild-1', 'toggle', { enabled: true });
            assert.strictEqual(enabledFired, true);
        });

        test('set appelle onDisable quand on désactive', async () => {
            let disabledFired = false;
            registry.define('toggle2', {
                defaults: { enabled: true },
                onDisable: async (guildId) => { disabledFired = true; }
            });
            registry._dbAvailable = false;
            await registry.set('guild-1', 'toggle2', { enabled: false });
            assert.strictEqual(disabledFired, true);
        });

        test('set rejette une feature inconnue', async () => {
            await assert.rejects(
                () => registry.set('guild-1', 'nope', { enabled: true }),
                /Feature inconnue/
            );
        });

        test('set requiert un guildId', async () => {
            registry.define('x', { defaults: {} });
            await assert.rejects(
                () => registry.set(null, 'x', {}),
                /guildId/
            );
        });
        test('set persiste et met à jour en DB avec timestamp millisecondes (BIGINT)', async () => {
            registry.define('logs_feat', {
                defaults: { enabled: false, channels: { moderation: null } }
            });
            const resSet = await registry.set('702103057898668072', 'logs_feat', {
                enabled: true,
                config: { channels: { moderation: '123456789' } },
                allowedRoles: ['987654321']
            });

            assert.strictEqual(resSet.enabled, true);
            assert.strictEqual(resSet.config.channels.moderation, '123456789');
            assert.deepStrictEqual(resSet.allowedRoles, ['987654321']);

            const fromDb = await registry.get('702103057898668072', 'logs_feat');
            assert.strictEqual(fromDb.enabled, true);
            assert.strictEqual(fromDb.config.channels.moderation, '123456789');
            assert.deepStrictEqual(fromDb.allowedRoles, ['987654321']);
            assert.strictEqual(fromDb.source, 'db');

            // Update existing row
            const resUpdate = await registry.set('702103057898668072', 'logs_feat', {
                enabled: false
            });
            assert.strictEqual(resUpdate.enabled, false);
            const fromDb2 = await registry.get('702103057898668072', 'logs_feat');
            assert.strictEqual(fromDb2.enabled, false);
            assert.strictEqual(fromDb2.config.channels.moderation, '123456789');
        });
    });

    describe('listForGuild', () => {
        test('combine define et état par défaut', async () => {
            registry.define('a', { defaults: { enabled: false } });
            registry.define('b', { defaults: { enabled: true, x: 1 } });
            const list = await registry.listForGuild('guild-1');
            assert.strictEqual(list.length, 2);
            const names = list.map(f => f.name).sort();
            assert.deepStrictEqual(names, ['a', 'b']);
        });
    });

    describe('canUse (role checks)', () => {
        let origResolve;
        let origHas;

        beforeEach(() => {
            const { container } = require('../src/core/container.js');
            origResolve = container.resolve;
            origHas = container.has;
        });

        afterEach(() => {
            const { container } = require('../src/core/container.js');
            container.resolve = origResolve;
            container.has = origHas;
        });

        test('returns not_member when member not found', async () => {
            registry.define('test_feature', {
                defaults: { enabled: true, allowed_roles: ['role1'] }
            });

            const mockGuild = {
                members: {
                    fetch: vi.fn().mockResolvedValue(null)
                }
            };
            const mockClient = {
                guilds: {
                    fetch: vi.fn().mockResolvedValue(mockGuild)
                }
            };

            const { container } = require('../src/core/container.js');
            container.has = (token) => token === 'Client';
            container.resolve = (token) => {
                if (token === 'Client') return mockClient;
                return origResolve(token);
            };

            const result = await registry.canUse('guild1', 'user1', 'test_feature');
            assert.strictEqual(result.allowed, false);
            assert.strictEqual(result.reason, 'not_member');
        });

        test('returns missing_role when user lacks required role', async () => {
            registry.define('role_feature', {
                defaults: { enabled: true, allowed_roles: ['role1', 'role2'] }
            });

            const mockMember = {
                roles: {
                    cache: new Map([['other_role', {}]])
                }
            };
            const mockGuild = {
                members: {
                    fetch: vi.fn().mockResolvedValue(mockMember)
                }
            };
            const mockClient = {
                guilds: {
                    fetch: vi.fn().mockResolvedValue(mockGuild)
                }
            };

            const { container } = require('../src/core/container.js');
            container.has = (token) => token === 'Client';
            container.resolve = (token) => {
                if (token === 'Client') return mockClient;
                return origResolve(token);
            };

            const result = await registry.canUse('guild1', 'user1', 'role_feature');
            assert.strictEqual(result.allowed, false);
            assert.strictEqual(result.reason, 'missing_role');
        });

        test('returns role_match when user has required role', async () => {
            registry.define('role_feature', {
                defaults: { enabled: true, allowed_roles: ['role1', 'role2'] }
            });

            const mockMember = {
                roles: {
                    cache: new Map([['role1', {}], ['other', {}]])
                }
            };
            const mockGuild = {
                members: {
                    fetch: vi.fn().mockResolvedValue(mockMember)
                }
            };
            const mockClient = {
                guilds: {
                    fetch: vi.fn().mockResolvedValue(mockGuild)
                }
            };

            const { container } = require('../src/core/container.js');
            container.has = (token) => token === 'Client';
            container.resolve = (token) => {
                if (token === 'Client') return mockClient;
                return origResolve(token);
            };

            const result = await registry.canUse('guild1', 'user1', 'role_feature');
            assert.strictEqual(result.allowed, true);
            assert.strictEqual(result.reason, 'role_match');
        });

        test('returns guild_not_found when guild does not exist', async () => {
            registry.define('guild_feature', {
                defaults: { enabled: true, allowed_roles: ['role1'] }
            });

            const mockClient = {
                guilds: {
                    fetch: vi.fn().mockResolvedValue(null)
                }
            };

            const { container } = require('../src/core/container.js');
            container.has = (token) => token === 'Client';
            container.resolve = (token) => {
                if (token === 'Client') return mockClient;
                return origResolve(token);
            };

            const result = await registry.canUse('guild1', 'user1', 'guild_feature');
            assert.strictEqual(result.allowed, true);
            assert.strictEqual(result.reason, 'guild_not_found');
        });

        test('returns check_error on exception', async () => {
            registry.define('error_feature', {
                defaults: { enabled: true, allowed_roles: ['role1'] }
            });

            const mockGuild = {
                members: {
                    fetch: vi.fn().mockImplementation(() => {
                        throw new Error('Unexpected error');
                    })
                }
            };
            const mockClient = {
                guilds: {
                    fetch: vi.fn().mockResolvedValue(mockGuild)
                }
            };

            const { container } = require('../src/core/container.js');
            container.has = (token) => token === 'Client';
            container.resolve = (token) => {
                if (token === 'Client') return mockClient;
                return origResolve(token);
            };

            const result = await registry.canUse('guild1', 'user1', 'error_feature');
            assert.strictEqual(result.allowed, true);
            assert.strictEqual(result.reason, 'check_error');
        });
    });

    describe('_reset', () => {
        test('clears all features and resets db availability', () => {
            registry.define('test', { defaults: {} });
            registry._dbAvailable = false;
            registry._reset();
            assert.strictEqual(registry.list().length, 0);
            assert.strictEqual(registry._dbAvailable, true);
        });
    });
});
