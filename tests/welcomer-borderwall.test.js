/**
 * tests/welcomer-borderwall.test.js
 *
 * Tests unitaires et d'intégration pour les fonctionnalités Welcomer & Borderwall (Module P7).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { CardRendererService } from '../src/modules/welcome_cards/services/card-renderer.service.js';
import { CaptchaService } from '../src/modules/security_captcha/captcha.service.js';

describe('Specialized Bot Feature P7: Welcomer Custom Cards & Borderwall Anti-Bot', () => {
    let cardRenderer;
    let captchaService;
    const guildId = 'test_guild_borderwall_123';

    beforeAll(async () => {
        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "borderwall_configs" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "enabled" integer DEFAULT 0 NOT NULL,
                    "raid_threshold" integer DEFAULT 5 NOT NULL,
                    "raid_window_seconds" integer DEFAULT 10 NOT NULL,
                    "quarantine_role_id" text,
                    "log_channel_id" text,
                    "timeout_minutes" integer DEFAULT 10 NOT NULL,
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint NOT NULL,
                    CONSTRAINT "borderwall_configs_guild_unique" UNIQUE("guild_id")
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "welcome_card_configs" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "background_url" text,
                    "primary_color" text DEFAULT '#5865F2' NOT NULL,
                    "text_color" text DEFAULT '#FFFFFF' NOT NULL,
                    "custom_subtitle" text DEFAULT 'Membre #{count}',
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint NOT NULL,
                    CONSTRAINT "welcome_card_configs_guild_unique" UNIQUE("guild_id")
                );
            `);
        } catch (_) {}
    });

    beforeEach(async () => {
        cardRenderer = new CardRendererService();
        captchaService = new CaptchaService({});
        await db.pool.query(`DELETE FROM borderwall_configs WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM welcome_card_configs WHERE guild_id = $1`, [guildId]);
    });

    it('CardRendererService should render welcome card with custom background, colors, and subtitle', () => {
        const payload = {
            username: 'ShadowGamer',
            server: 'Gaming Zone',
            avatarUrl: 'https://example.com/avatar.png',
            backgroundUrl: 'https://example.com/custom_bg.png',
            primaryColor: '#FF5733',
            textColor: '#00FFCC',
            customSubtitle: 'Bienvenue dans la communauté VIP !',
            memberCount: 420
        };

        const svg = cardRenderer.render('welcome', payload);

        expect(svg).toContain('https://example.com/custom_bg.png');
        expect(svg).toContain('#FF5733');
        expect(svg).toContain('#00FFCC');
        expect(svg).toContain('Bienvenue dans la communauté VIP !');
        expect(svg).toContain('Membre #420');
    });

    it('CaptchaService should detect mass joins in anti-raid window', () => {
        // Simuler 4 arrivées avec un seuil de 5 en 10 secondes -> pas de raid
        for (let i = 0; i < 4; i++) {
            const isRaid = captchaService.recordJoinAndCheckRaid(guildId, 5, 10);
            expect(isRaid).toBe(false);
        }

        // 5ème arrivée rapide -> Déclenchement Anti-Raid Borderwall
        const isRaidTriggered = captchaService.recordJoinAndCheckRaid(guildId, 5, 10);
        expect(isRaidTriggered).toBe(true);
    });

    it('CaptchaService should save and retrieve Borderwall configuration', async () => {
        const config = await captchaService.setBorderwallConfig(guildId, {
            enabled: true,
            raidThreshold: 6,
            raidWindowSeconds: 15,
            quarantineRoleId: 'role_quarantine_999',
            timeoutMinutes: 5
        });

        expect(config.enabled).toBe(true);
        expect(config.raidThreshold).toBe(6);
        expect(config.quarantineRoleId).toBe('role_quarantine_999');

        const retrieved = await captchaService.getBorderwallConfig(guildId);
        expect(retrieved.enabled).toBe(true);
        expect(retrieved.timeoutMinutes).toBe(5);
    });
});
