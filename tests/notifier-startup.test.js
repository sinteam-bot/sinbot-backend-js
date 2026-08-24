const { test, describe } = require('node:test');
const assert = require('node:assert');
const { container } = require('../src/core/container.js');
const { StartupNotifierService } = require('../src/modules/notifier_startup/startup-notifier.service.js');
const { StartupNotifierController } = require('../src/modules/notifier_startup/startup-notifier.controller.js');

describe('Startup Notifier Module Tests', () => {

    test('Service: should detect current commit info and get status', async () => {
        const service = container.resolve(StartupNotifierService);
        const commitInfo = await service.getCurrentCommitInfo();

        assert.ok(commitInfo);
        assert.ok(typeof commitInfo.sha === 'string');
        assert.ok(typeof commitInfo.source === 'string');

        const status = await service.getStatus();
        assert.ok(status);
        assert.strictEqual(typeof status.enabled, 'boolean');
        assert.strictEqual(status.currentSha, commitInfo.sha);
    });

    test('Controller: should return status object', async () => {
        const controller = container.resolve(StartupNotifierController);
        const res = await controller.getStatus();

        assert.ok(res.success);
        assert.ok(res.data);
        assert.strictEqual(typeof res.data.enabled, 'boolean');
    });

});
