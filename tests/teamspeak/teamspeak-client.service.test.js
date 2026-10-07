const assert = require('node:assert');
const { TeamSpeakClientService } = require('../../src/modules/util_teamspeak/services/teamspeak-client.service.js');

describe('TeamSpeakClientService', () => {
    let service;

    beforeEach(() => {
        service = new TeamSpeakClientService();
    });

    afterEach(async () => {
        await service.disconnect();
    });

    describe('isConfigured', () => {
        test('returns false when no password is set', () => {
            service.setConfig({
                server: { host: '127.0.0.1', password: '' }
            });
            assert.strictEqual(service.isConfigured(), false);
        });

        test('returns true when host and password are provided', () => {
            service.setConfig({
                server: { host: 'ts.myserver.com', password: 'secretpassword' }
            });
            assert.strictEqual(service.isConfigured(), true);
        });

        test('resolves default ports and protocols', () => {
            service.setConfig({
                server: { host: 'ts.myserver.com', password: 'secretpassword' }
            });
            assert.strictEqual(service._resolveQueryPort(), 10011);
            assert.strictEqual(service._resolveServerPort(), 9987);
            assert.strictEqual(service._resolveUsername(), 'serveradmin');
            assert.strictEqual(service._resolveNickname(), 'DiscordTS3Widget');
        });
    });

    describe('getTreeData and cache', () => {
        test('returns initial offline tree data when not connected', () => {
            const data = service.getTreeData();
            assert.strictEqual(data.online, false);
            assert.ok(Array.isArray(data.channels));
            assert.ok(Array.isArray(data.clients));
            assert.strictEqual(typeof data.serverInfo, 'object');
            assert.strictEqual(data.serverInfo.online, false);
        });

        test('refreshCache safely returns data when disconnected', async () => {
            const data = await service.refreshCache();
            assert.strictEqual(data.online, false);
        });
    });

    describe('disconnect', () => {
        test('disconnects cleanly without throwing error', async () => {
            assert.doesNotThrow(async () => {
                await service.disconnect();
            });
            assert.strictEqual(service.isConnected(), false);
        });
    });
});
