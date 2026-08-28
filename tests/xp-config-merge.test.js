/**
 * Tests for the deep-merge logic in XPLevelController.updateConfig
 *
 * The controller is not directly exported with _deepMerge as a public
 * method, but we re-implement the same algorithm in a small helper
 * to validate the behavior. The production path is exercised by the
 * HTTP endpoint.
 */

const assert = require('node:assert');

function deepMerge(target, source) {
    if (typeof source !== 'object' || source === null) return source;
    const out = Array.isArray(target) ? [...target] : { ...(target || {}) };
    for (const [k, v] of Object.entries(source)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            out[k] = deepMerge(out[k], v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

describe('XP config deep-merge', () => {
    test('merge remplace un scalaire', () => {
        const out = deepMerge({ a: 1, b: 2 }, { b: 3 });
        assert.deepStrictEqual(out, { a: 1, b: 3 });
    });

    test('merge préserve les clés non patchées', () => {
        const out = deepMerge({ a: 1, b: 2, c: 3 }, { b: 99 });
        assert.strictEqual(out.a, 1);
        assert.strictEqual(out.c, 3);
        assert.strictEqual(out.b, 99);
    });

    test('merge descend dans les sous-objets', () => {
        const out = deepMerge({
            message_xp: { min: 15, max: 25, cooldown: 10 },
            enabled: false
        }, {
            message_xp: { max: 50 }
        });
        assert.strictEqual(out.message_xp.min, 15);
        assert.strictEqual(out.message_xp.max, 50);
        assert.strictEqual(out.message_xp.cooldown, 10);
        assert.strictEqual(out.enabled, false);
    });

    test('merge remplace un objet par un scalaire', () => {
        const out = deepMerge({ a: { x: 1 } }, { a: 'replaced' });
        assert.strictEqual(out.a, 'replaced');
    });

    test('merge ajoute une nouvelle clé', () => {
        const out = deepMerge({ a: 1 }, { b: { nested: true } });
        assert.strictEqual(out.b.nested, true);
    });

    test('merge gère les arrays (remplacement complet)', () => {
        const out = deepMerge({ arr: [1, 2, 3] }, { arr: [9] });
        assert.deepStrictEqual(out.arr, [9]);
    });

    test('merge gère une cible null', () => {
        const out = deepMerge(null, { a: 1 });
        assert.deepStrictEqual(out, { a: 1 });
    });

    test('merge simule un patch réel de config XP', () => {
        const current = {
            enabled: true,
            message_xp: { min: 15, max: 25, cooldown: 10 },
            voice_xp: { per_minute: 2 },
            level_up: {
                enabled: true,
                channel_id: '111',
                template: 'GG {user}'
            },
            level_roles: { 5: '111', 20: '222' }
        };
        const patch = {
            level_up: { channel_id: 'NEW_CHANNEL', color: '#ff00ff' }
        };
        const out = deepMerge(current, patch);
        assert.strictEqual(out.level_up.channel_id, 'NEW_CHANNEL');
        assert.strictEqual(out.level_up.color, '#ff00ff');
        assert.strictEqual(out.level_up.template, 'GG {user}');
        assert.strictEqual(out.level_up.enabled, true);
        assert.strictEqual(out.message_xp.min, 15);
        assert.strictEqual(out.level_roles['5'], '111');
    });
});
