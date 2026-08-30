import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import createWebRouter from '../src/web/webRouter.js';
import { db, ready } from '../src/db/index.js';

describe('Feature G01: Public Leaderboard Endpoint Tests', () => {
    let app, server, baseUrl;
    const guildId = 'test_guild_lb_123';

    beforeAll(async () => {
        await ready;
        // Populate test data in user_xp and user_economy
        await db.pool.query(`DELETE FROM user_xp WHERE user_id LIKE 'test_lb_%'`);
        await db.pool.query(`DELETE FROM user_economy WHERE guild_id = $1`, [guildId]);

        await db.pool.query(
            `INSERT INTO user_xp (user_id, username, xp, level, messages_count, voice_minutes)
             VALUES ('test_lb_1', 'PlayerOne', 2500, 15, 120, 45),
                    ('test_lb_2', 'PlayerTwo', 1200, 8, 60, 20)`
        );

        await db.pool.query(
            `INSERT INTO user_economy (user_id, guild_id, balance, bank_balance, total_earned, total_spent, created_at, updated_at)
             VALUES ('test_lb_1', $1, 5000, 2000, 7000, 0, $2, $2),
                    ('test_lb_2', $1, 1500, 500, 2000, 0, $2, $2)`,
            [guildId, Date.now()]
        );

        const mockClient = {
            isReady: () => true,
            guilds: {
                fetch: async () => ({
                    id: guildId,
                    name: 'Serveur Leaderboard Test',
                    memberCount: 50,
                    iconURL: () => 'https://cdn.discordapp.com/icons/123/icon.png',
                    members: { cache: new Map() }
                }),
                cache: new Map()
            }
        };

        app = express();
        app.use(express.json());
        app.use('/api', createWebRouter(mockClient));

        await new Promise(resolve => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}/api/leaderboard`;
    });

    afterAll(async () => {
        if (server) await new Promise(r => server.close(r));
    });

    it('GET /api/leaderboard/public returns both XP and Economy rankings with OpenGraph metadata', async () => {
        const res = await fetch(`${baseUrl}/public?guild_id=${guildId}`);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.guild).toBeDefined();
        expect(body.guild.name).toBe('Serveur Leaderboard Test');
        expect(body.meta).toBeDefined();
        expect(body.meta.title).toContain('Classement');
        expect(body.data.xp).toBeDefined();
        expect(body.data.economy).toBeDefined();
        expect(body.data.xp.users.length).toBeGreaterThanOrEqual(2);
        expect(body.data.economy.users.length).toBe(2);

        // Verify order: test_lb_1 has 5000 coins and rank 1
        expect(body.data.economy.users[0].userId).toBe('test_lb_1');
        expect(body.data.economy.users[0].rank).toBe(1);
    });

    it('GET /api/leaderboard/public?type=xp returns only XP leaderboard', async () => {
        const res = await fetch(`${baseUrl}/public?guild_id=${guildId}&type=xp`);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.users).toBeDefined();
        expect(body.data.users[0].xp).toBeGreaterThanOrEqual(body.data.users[1].xp);
    });

    it('GET /api/leaderboard/public?type=economy returns only Economy leaderboard', async () => {
        const res = await fetch(`${baseUrl}/public?guild_id=${guildId}&type=economy`);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.users).toBeDefined();
        expect(body.data.users[0].balance).toBe(5000);
    });
});
