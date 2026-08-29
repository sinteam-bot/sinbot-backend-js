import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import createWebRouter from '../src/web/webRouter.js';

describe('Web Controllers & Router Refactor Tests', () => {
    let app, server, baseUrl;
    let mockClient;

    beforeAll(async () => {
        mockClient = {
            isReady: vi.fn().mockReturnValue(true),
            user: {
                id: '1337543177086959657',
                username: 'ObsydemonBot',
                tag: 'ObsydemonBot#0001',
                avatar: 'avatar_hash_123'
            },
            ws: { ping: 32 },
            guilds: {
                fetch: vi.fn().mockResolvedValue({
                    id: '1337543177086959999',
                    name: 'Serveur Test',
                    memberCount: 42,
                    iconURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/icons/123/icon.png'),
                    emojis: {
                        cache: new Map([
                            ['1001', { id: '1001', name: 'fire', animated: false, imageURL: () => 'https://cdn.discordapp.com/emojis/1001.png' }]
                        ])
                    },
                    roles: {
                        cache: new Map([
                            ['2001', { id: '2001', name: 'Admin', color: 0xFF0000, position: 10, members: new Map() }]
                        ])
                    },
                    channels: {
                        fetch: vi.fn().mockResolvedValue(new Map([
                            ['3001', {
                                id: '3001',
                                name: 'general',
                                type: 0,
                                position: 1,
                                topic: 'Salon général',
                                isTextBased: () => true,
                                isThread: () => false
                            }]
                        ])),
                        cache: new Map()
                    },
                    members: {
                        cache: new Map([
                            ['1337543177086959657', {
                                id: '1337543177086959657',
                                displayName: 'TestUser',
                                user: { id: '1337543177086959657', username: 'TestUser', bot: false },
                                roles: { highest: { id: '2001', name: 'Admin', position: 10 }, cache: new Map() },
                                joinedAt: new Date()
                            }]
                        ]),
                        fetch: vi.fn().mockResolvedValue(new Map())
                    }
                }),
                cache: new Map([
                    ['1337543177086959999', { id: '1337543177086959999', name: 'Serveur Test' }]
                ]),
                first: vi.fn().mockReturnValue({ id: '1337543177086959999', name: 'Serveur Test' })
            },
            channels: {
                fetch: vi.fn().mockResolvedValue({
                    id: '1337543177086959661',
                    name: 'general',
                    isTextBased: () => true,
                    messages: {
                        fetch: vi.fn().mockResolvedValue(new Map([
                            ['4001', {
                                id: '4001',
                                channelId: '1337543177086959661',
                                content: 'Hello World',
                                createdAt: new Date(),
                                author: { id: '1337543177086959657', username: 'TestUser' },
                                attachments: new Map(),
                                embeds: [],
                                reactions: { cache: new Map() }
                            }]
                        ]))
                    }
                })
            },
            commands: new Map([
                ['ping', { data: { name: 'ping', description: 'Ping command' }, executeSlash: true, module: 'util_info' }]
            ])
        };

        app = express();
        app.use(express.json());
        app.use('/api', createWebRouter(mockClient));

        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}/api`;
    });

    afterAll(async () => {
        if (server) await new Promise((r) => server.close(r));
    });

    it('GET /api/guild returns guild and bot information', async () => {
        const res = await fetch(`${baseUrl}/guild`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.name).toBe('Serveur Test');
        expect(body.bot.username).toBe('ObsydemonBot');
    });

    it('GET /api/emojis returns guild emojis', async () => {
        const res = await fetch(`${baseUrl}/emojis`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
    });

    it('GET /api/roles returns guild roles', async () => {
        const res = await fetch(`${baseUrl}/roles`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
    });

    it('GET /api/channels returns channels hierarchy', async () => {
        const res = await fetch(`${baseUrl}/channels`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.channels).toBeDefined();
    });

    it('GET /api/channels/:channelId/messages returns messages', async () => {
        const res = await fetch(`${baseUrl}/channels/1337543177086959661/messages`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.messages).toBeDefined();
    });

    it('GET /api/users returns member list', async () => {
        const res = await fetch(`${baseUrl}/users`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
    });

    it('GET /api/config returns configuration and modules status', async () => {
        const res = await fetch(`${baseUrl}/config`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.modules).toBeDefined();
    });

    it('GET /api/modules/status returns modules list', async () => {
        const res = await fetch(`${baseUrl}/modules/status`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
    });

    it('GET /api/openrouter/config returns openrouter config', async () => {
        const res = await fetch(`${baseUrl}/openrouter/config`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.default_model).toBeDefined();
    });

    it('GET /api/logs/system returns system logs', async () => {
        const res = await fetch(`${baseUrl}/logs/system`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
    });

    it('GET /api/commands returns registered commands', async () => {
        const res = await fetch(`${baseUrl}/commands`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.commands).toBeDefined();
    });

    it('GET /api/template/presets returns template presets', async () => {
        const res = await fetch(`${baseUrl}/template/presets`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
    });

    it('POST /api/template/render renders a template', async () => {
        const res = await fetch(`${baseUrl}/template/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template: { content: 'Bonjour {{ user.name }} !' },
                context: { user: { name: 'Alice' } }
            })
        });
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.content).toBe('Bonjour Alice !');
    });

    it('GET /api/games/stats returns games statistics overview', async () => {
        const res = await fetch(`${baseUrl}/games/stats`);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.counter).toBeDefined();
        expect(body.data.countdown).toBeDefined();
    });

    it('Validates discord parameter formats (:channelId, :userId, :messageId)', async () => {
        const res = await fetch(`${baseUrl}/channels/invalid-id/messages`);
        const body = await res.json();
        expect(res.status).toBe(400);
        expect(body.error).toContain('channelId invalide');
    });
});
