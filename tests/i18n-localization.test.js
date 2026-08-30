/**
 * tests/i18n-localization.test.js
 *
 * Tests unitaires pour le moteur i18n et la localisation (Phase 14 G34).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { i18n } from '../src/core/i18n.js';

describe('Feature G34: i18n & Multi-language Localization Tests', () => {
    const guildId = 'test_guild_i18n_123';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "guild_languages" (
                "guild_id" text PRIMARY KEY NOT NULL,
                "language" text DEFAULT 'fr' NOT NULL,
                "updated_at" bigint NOT NULL
            );
        `);
    });

    beforeEach(async () => {
        await db.pool.query(`DELETE FROM guild_languages WHERE guild_id = $1`, [guildId]);
    });

    it('should translate keys in FR, EN, ES with interpolation', () => {
        const frMsg = i18n.t('economy.daily_success', 'fr', { reward: 150, balance: 500 });
        expect(frMsg).toBe('✅ Tu as reçu **150** 🪙 ! Solde : **500**');

        const enMsg = i18n.t('economy.daily_success', 'en', { reward: 150, balance: 500 });
        expect(enMsg).toBe('✅ You received **150** 🪙! Balance: **500**');

        const esMsg = i18n.t('economy.daily_success', 'es', { reward: 150, balance: 500 });
        expect(esMsg).toBe('✅ ¡Has recibido **150** 🪙! Saldo: **500**');
    });

    it('should save and retrieve guild language preference', async () => {
        await i18n.setGuildLanguage(guildId, 'en');
        const lang = await i18n.getGuildLanguage(guildId);
        expect(lang).toBe('en');

        const msg = i18n.t('moderation.kick_success', guildId, { user: '@BadGuy' });
        expect(msg).toBe('👢 Member @BadGuy has been kicked.');
    });
});
