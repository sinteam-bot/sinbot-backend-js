/**
 * Tests for TempVoiceService (Phase 12b)
 */

const assert = require('node:assert');
const { TempVoiceService } = require('../src/modules/util_temp-voice/services/temp-voice.service.js');

class FakeRepo {
    constructor() {
        this.configs = new Map();
        this.states = new Map();
    }
    async getConfig(guildId) {
        return this.configs.get(guildId) || null;
    }
    async upsertConfig(c) {
        const id = c.guildId;
        const cur = this.configs.get(id) || {};
        const next = { ...cur, ...c, updatedAt: Date.now() };
        this.configs.set(id, next);
        return next;
    }
    async insertState(s) {
        const cur = this.states.get(s.channelId) || {};
        this.states.set(s.channelId, { ...cur, ...s });
    }
    async getState(channelId) {
        return this.states.get(channelId) || null;
    }
    async deleteState(channelId) {
        this.states.delete(channelId);
    }
    async listActiveStates(guildId) {
        return [...this.states.values()].filter(s => s.guildId === guildId);
    }
    async listStatesEmptySince(guildId, beforeMs) {
        return [...this.states.values()].filter(s =>
            s.guildId === guildId && s.lastEmptyAt > 0 && s.lastEmptyAt <= beforeMs
        );
    }
    async countByGuild(guildId) {
        return [...this.states.values()].filter(s => s.guildId === guildId).length;
    }
}

describe('TempVoiceService', () => {
    let svc, repo;
    beforeEach(() => { repo = new FakeRepo(); svc = new TempVoiceService(repo); });

    describe('getConfig / setConfig', () => {
        test('getConfig retourne les défauts si pas de BDD', async () => {
            const c = await svc.getConfig('g1');
            assert.strictEqual(c.enabled, false);
            assert.strictEqual(c.format, "{user}'s game");
            assert.deepStrictEqual(c.joinChannels, []);
            assert.strictEqual(c.deleteDelaySeconds, 5);
        });

        test('setConfig persiste en BDD', async () => {
            const c = await svc.setConfig('g1', { enabled: true, format: 'Game of {user}' });
            assert.strictEqual(c.enabled, true);
            assert.strictEqual(c.format, 'Game of {user}');
            const got = await svc.getConfig('g1');
            assert.strictEqual(got.enabled, true);
        });
    });

    describe('isJoinChannel', () => {
        test('retourne true si channelId est dans join_channels', () => {
            const c = { joinChannels: ['a', 'b', 'c'] };
            assert.strictEqual(svc.isJoinChannel('b', c), true);
        });
        test('retourne false sinon', () => {
            const c = { joinChannels: ['a', 'b'] };
            assert.strictEqual(svc.isJoinChannel('z', c), false);
            assert.strictEqual(svc.isJoinChannel('z', null), false);
            assert.strictEqual(svc.isJoinChannel('z', {}), false);
        });
    });

    describe('isEnabled / canCreate', () => {
        test('isEnabled false par défaut', () => {
            assert.strictEqual(svc.isEnabled({ enabled: false }), false);
            assert.strictEqual(svc.isEnabled({ enabled: true }), true);
        });

        test('canCreate true si pas de max', async () => {
            assert.strictEqual(await svc.canCreate('g1', { maxPerGuild: 0 }), true);
        });

        test('canCreate false si max atteint', async () => {
            // Crée 2 vocaux en BDD (max = 2)
            await svc.registerChannel('c1', 'g1', 'u1');
            await svc.registerChannel('c2', 'g1', 'u1');
            const c = { maxPerGuild: 2 };
            assert.strictEqual(await svc.canCreate('g1', c), false);
        });

        test('canCreate true si max pas atteint', async () => {
            await svc.registerChannel('c1', 'g1', 'u1');
            const c = { maxPerGuild: 3 };
            assert.strictEqual(await svc.canCreate('g1', c), true);
        });
    });

    describe('computeChannelName', () => {
        test('remplace {user} par le globalName', () => {
            const name = svc.computeChannelName(
                { globalName: 'Alice', username: 'alice' },
                { format: "{user}'s game" }
            );
            assert.strictEqual(name, "Alice's game");
        });
        test('remplace {username} par le username', () => {
            const name = svc.computeChannelName(
                { globalName: 'Alice', username: 'alice42' },
                { format: '{username} game' }
            );
            assert.strictEqual(name, 'alice42 game');
        });
        test('fallback sur username si pas de globalName', () => {
            const name = svc.computeChannelName(
                { username: 'Bob' },
                { format: '{user}\u0027s space' }
            );
            assert.strictEqual(name, "Bob's space");
        });
        test('tronque à 100 chars', () => {
            const name = svc.computeChannelName(
                { globalName: 'A'.repeat(150) },
                { format: '{user}' }
            );
            assert.strictEqual(name.length, 100);
        });
    });

    describe('computeSuffixName', () => {
        test('pas de suffix si 1 user', () => {
            assert.strictEqual(svc.computeSuffixName('Game', 1), 'Game');
        });
        test('ajoute 🎮 si >= 2 users', () => {
            assert.strictEqual(svc.computeSuffixName('Game', 2), 'Game 🎮');
            assert.strictEqual(svc.computeSuffixName('Game', 5), 'Game 🎮');
        });
    });

    describe('registerChannel / markEmpty / markActive / forgetChannel', () => {
        test('registerChannel persiste en BDD', async () => {
            await svc.registerChannel('c1', 'g1', 'u1');
            const s = await svc.getState('c1');
            assert.ok(s);
            assert.strictEqual(s.guildId, 'g1');
            assert.strictEqual(s.creatorId, 'u1');
            assert.strictEqual(s.lastEmptyAt, 0);
        });

        test('markEmpty set lastEmptyAt = now', async () => {
            await svc.registerChannel('c1', 'g1', 'u1');
            await svc.markEmpty('c1');
            const s = await svc.getState('c1');
            assert.ok(s.lastEmptyAt > 0);
        });

        test('markActive reset lastEmptyAt = 0', async () => {
            await svc.registerChannel('c1', 'g1', 'u1');
            await svc.markEmpty('c1');
            await svc.markActive('c1');
            const s = await svc.getState('c1');
            assert.strictEqual(s.lastEmptyAt, 0);
        });

        test('forgetChannel supprime l\'entry', async () => {
            await svc.registerChannel('c1', 'g1', 'u1');
            await svc.forgetChannel('c1');
            const s = await svc.getState('c1');
            assert.strictEqual(s, null);
        });
    });

    describe('listExpiringNow', () => {
        test('retourne les canaux vides depuis > delay', async () => {
            // Canal vide. lastEmptyAt est Date.now() au moment de markEmpty.
            await svc.registerChannel('c1', 'g1', 'u1');
            await svc.markEmpty('c1');
            // delay 0 = tout canal vide est "expiré"
            const exp = await svc.listExpiringNow('g1', 0);
            assert.strictEqual(exp.length, 1);
            assert.strictEqual(exp[0].channelId, 'c1');
        });

        test('ignore les canaux avec lastEmptyAt = 0 (actifs)', async () => {
            await svc.registerChannel('c1', 'g1', 'u1');
            const exp = await svc.listExpiringNow('g1', 0);
            assert.strictEqual(exp.length, 0);
        });

        test('ignore un canal non enregistré', async () => {
            const exp = await svc.listExpiringNow('g1', 0);
            assert.strictEqual(exp.length, 0);
        });
    });

    describe('listActive / count', () => {
        test('listActive retourne les canaux actifs du guild', async () => {
            await svc.registerChannel('c1', 'g1', 'u1');
            await svc.registerChannel('c2', 'g1', 'u2');
            await svc.registerChannel('c3', 'g2', 'u3');
            const list = await svc.listActive('g1');
            assert.strictEqual(list.length, 2);
        });

        test('countByGuild compte par guild', async () => {
            await svc.registerChannel('c1', 'g1', 'u1');
            await svc.registerChannel('c2', 'g1', 'u2');
            await svc.registerChannel('c3', 'g2', 'u3');
            assert.strictEqual(await svc.repo.countByGuild('g1'), 2);
            assert.strictEqual(await svc.repo.countByGuild('g2'), 1);
        });
    });
});
