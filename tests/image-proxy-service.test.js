const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { ImageProxyService } = require('../src/services/imageProxyService.js');

describe('ImageProxyService Tests', () => {
    let service;

    before(() => {
        service = new ImageProxyService();
    });

    it('isValidUrl: should accept valid Discord CDN URLs', () => {
        assert.strictEqual(service.isValidUrl('https://cdn.discordapp.com/avatars/123/abc.png?size=128'), true);
        assert.strictEqual(service.isValidUrl('https://cdn.discordapp.com/embed/avatars/0.png'), true);
        assert.strictEqual(service.isValidUrl('https://media.discordapp.net/attachments/111/222/img.png'), true);
        assert.strictEqual(service.isValidUrl('https://cdn.discordapp.com/emojis/99999.png?size=48&quality=lossless'), true);
    });

    it('isValidUrl: should reject malicious / SSRF URLs', () => {
        assert.strictEqual(service.isValidUrl('http://localhost:3000/secret'), false);
        assert.strictEqual(service.isValidUrl('http://127.0.0.1:8080/admin'), false);
        assert.strictEqual(service.isValidUrl('http://192.168.1.1/router'), false);
        assert.strictEqual(service.isValidUrl('http://10.0.0.1/metadata'), false);
        assert.strictEqual(service.isValidUrl('http://172.20.0.1/private'), false);
        assert.strictEqual(service.isValidUrl('file:///etc/passwd'), false);
        assert.strictEqual(service.isValidUrl('javascript:alert(1)'), false);
        assert.strictEqual(service.isValidUrl('https://malicious-domain.com/hack.png'), false);
    });

    it('getFallbackEntry: returns SVG avatar fallback for avatar URLs', () => {
        const fallback = service.getFallbackEntry('https://cdn.discordapp.com/avatars/123/broken.png');
        assert.strictEqual(fallback.contentType, 'image/svg+xml');
        assert.ok(fallback.buffer.length > 0);
    });

    it('getFallbackEntry: returns transparent PNG for general images', () => {
        const fallback = service.getFallbackEntry('https://cdn.discordapp.com/attachments/123/broken.png');
        assert.strictEqual(fallback.contentType, 'image/png');
        assert.ok(fallback.buffer.length > 0);
    });

    it('fetchImage: caches responses and returns cached buffer on second call', async () => {
        const mockUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
        const result1 = await service.fetchImage(mockUrl);
        assert.ok(result1);
        assert.ok(result1.buffer);
        assert.ok(result1.etag);

        // Second call should return identical ETag from cache
        const result2 = await service.fetchImage(mockUrl);
        assert.strictEqual(result2.etag, result1.etag);
    });

    it('handleRequest: handles 304 Not Modified when ETag matches', async () => {
        const mockUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
        const entry = await service.fetchImage(mockUrl);

        let statusCode = 200;
        let responseSent = false;
        const headers = {};

        const req = {
            query: { url: mockUrl },
            headers: { 'if-none-match': entry.etag }
        };

        const res = {
            status: (code) => {
                statusCode = code;
                return res;
            },
            setHeader: (k, v) => {
                headers[k] = v;
            },
            removeHeader: (k) => {
                delete headers[k];
            },
            send: (buf) => {
                responseSent = true;
            },
            end: () => {
                responseSent = true;
            }
        };

        await service.handleRequest(req, res);
        assert.strictEqual(statusCode, 304);
        assert.strictEqual(responseSent, true);
    });
});
