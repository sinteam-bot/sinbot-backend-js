const assert = require('node:assert');

describe('modulesSummary', () => {
    let modulesSummary;

    beforeAll(() => {
        modulesSummary = require('../src/utils/modulesSummary.js');
    });

    describe('getModulesStatusList', () => {
        test('returns an array', () => {
            const result = modulesSummary.getModulesStatusList();
            assert.ok(Array.isArray(result));
        });

        test('returns non-empty array', () => {
            const result = modulesSummary.getModulesStatusList();
            assert.ok(result.length > 0);
        });

        test('each module has required properties', () => {
            const result = modulesSummary.getModulesStatusList();
            for (const mod of result) {
                assert.ok(typeof mod.key === 'string');
                assert.ok(typeof mod.name === 'string');
                assert.ok(typeof mod.category === 'string');
                assert.ok(typeof mod.icon === 'string');
                assert.ok(typeof mod.enabled === 'boolean');
            }
        });

        test('database is always enabled', () => {
            const result = modulesSummary.getModulesStatusList();
            const mod = result.find(m => m.key === 'database');
            assert.ok(mod);
            assert.strictEqual(mod.enabled, true);
        });

        test('includes expected module keys', () => {
            const result = modulesSummary.getModulesStatusList();
            const keys = result.map(m => m.key);
            assert.ok(keys.includes('startup_notifier'));
            assert.ok(keys.includes('scheduler'));
            assert.ok(keys.includes('daily_message'));
            assert.ok(keys.includes('captcha'));
            assert.ok(keys.includes('welcome'));
            assert.ok(keys.includes('xp'));
            assert.ok(keys.includes('counter'));
            assert.ok(keys.includes('countdown'));
            assert.ok(keys.includes('database'));
        });

        test('modules have details string', () => {
            const result = modulesSummary.getModulesStatusList();
            for (const mod of result) {
                assert.ok(typeof mod.details === 'string');
            }
        });

        test('parent modules are correctly identified', () => {
            const result = modulesSummary.getModulesStatusList();
            const schedulerBump = result.find(m => m.key === 'scheduler_bump');
            assert.ok(schedulerBump);
            assert.strictEqual(schedulerBump.parent, 'scheduler');
        });

        test('returns consistent results on multiple calls', () => {
            const result1 = modulesSummary.getModulesStatusList();
            const result2 = modulesSummary.getModulesStatusList();
            assert.strictEqual(result1.length, result2.length);
        });
    });

    describe('printStartupModulesTable', () => {
        test('does not throw', () => {
            assert.doesNotThrow(() => {
                modulesSummary.printStartupModulesTable();
            });
        });

        test('outputs to console', () => {
            const originalLog = console.log;
            let output = '';
            console.log = (...args) => {
                output += args.join(' ') + '\n';
            };
            modulesSummary.printStartupModulesTable();
            console.log = originalLog;
            assert.ok(output.includes('MODULES'));
            assert.ok(output.length > 0);
        });
    });
});
