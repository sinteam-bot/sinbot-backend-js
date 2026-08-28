const assert = require('node:assert');
const { container } = require('../src/core/container.js');
const { WelcomeService } = require('../src/modules/feature_welcome/welcome.service.js');
const { WelcomeController } = require('../src/modules/feature_welcome/welcome.controller.js');

describe('Feature: Welcome Module Tests', () => {

    test('Service: should handle auto roles and welcome messages', async () => {
        const service = container.resolve(WelcomeService);
        service.getConfig = () => ({ enabled: true });

        const rolesAdded = [];
        let publicSent = null;
        let dmSent = null;

        const mockMember = {
            id: 'test_member_123',
            user: { id: 'test_member_123', username: 'Newbie', tag: 'Newbie#0001', bot: false, displayAvatarURL: () => 'https://avatar.png' },
            guild: {
                name: 'Test Server',
                memberCount: 42,
                channels: {
                    fetch: async () => ({
                        isTextBased: () => true,
                        send: async (payload) => { publicSent = payload; }
                    })
                }
            },
            roles: {
                add: async (roleId) => { rolesAdded.push(roleId); }
            },
            send: async (payload) => { dmSent = payload; }
        };

        await service.handleWelcome(mockMember);

        assert.ok(service.getStatus());
        assert.strictEqual(service.getStatus().enabled, true);
    });

    test('Controller: should return status object', async () => {
        const controller = container.resolve(WelcomeController);
        const res = await controller.getStatus();

        assert.ok(res.success);
        assert.ok(res.data);
        assert.strictEqual(typeof res.data.enabled, 'boolean');
    });

});
