/**
 * tests/automod-advanced-filters.test.js
 *
 * Tests unitaires pour les filtres avancés d'AutoMod (Phase 11 G16, G36, G37, G38).
 */

import { describe, it, expect } from 'vitest';
import { AutomodEngine } from '../src/modules/security_automod/services/automod-engine.service.js';

describe('Feature AutoMod Advanced Filters (G16, G36, G37, G38)', () => {
    const engine = new AutomodEngine();

    it('G37: anti-sticker should detect and delete stickers', async () => {
        let deleted = false;
        const mockMsg = {
            guild: { id: 'g1' },
            author: { id: 'u1', bot: false },
            stickers: new Map([['s1', { id: 's1' }]]),
            delete: async () => { deleted = true; }
        };

        const config = {
            anti_sticker: { enabled: true, action: 'delete' }
        };

        const res = await engine.processMessage(mockMsg, config);
        expect(res.acted).toBe(true);
        expect(res.actions).toContain('anti_sticker');
        expect(deleted).toBe(true);
    });

    it('G36: anti-zalgo should detect zalgo characters', async () => {
        let deleted = false;
        const zalgoText = 'H̶e̷l̸l̴o̷ ̴W̷o̵r̸l̶d̶';
        const mockMsg = {
            guild: { id: 'g1' },
            author: { id: 'u1', bot: false },
            content: zalgoText,
            delete: async () => { deleted = true; }
        };

        const config = {
            anti_zalgo: { enabled: true, max_zalgo_chars: 3, action: 'delete' }
        };

        const res = await engine.processMessage(mockMsg, config);
        expect(res.acted).toBe(true);
        expect(res.actions).toContain('anti_zalgo');
        expect(deleted).toBe(true);
    });

    it('G16: anti-attachment spam should block excessive attachments in single message', async () => {
        let deleted = false;
        const mockMsg = {
            guild: { id: 'g1' },
            author: { id: 'u1', bot: false },
            attachments: new Map([
                ['a1', {}], ['a2', {}], ['a3', {}], ['a4', {}]
            ]),
            delete: async () => { deleted = true; }
        };

        const config = {
            anti_attachment_spam: { enabled: true, max_per_message: 3, action: 'delete' }
        };

        const res = await engine.processMessage(mockMsg, config);
        expect(res.acted).toBe(true);
        expect(res.actions).toContain('anti_attachment_spam:max_per_message');
        expect(deleted).toBe(true);
    });

    it('G38: channel_rules media_only should delete text-only messages', async () => {
        let deleted = false;
        const mockMsg = {
            guild: { id: 'g1' },
            channelId: 'chan_photos_123',
            author: { id: 'u1', bot: false },
            content: 'Juste un message texte sans image',
            attachments: new Map(),
            delete: async () => { deleted = true; }
        };

        const config = {
            channel_rules: {
                chan_photos_123: { media_only: true }
            }
        };

        const res = await engine.processMessage(mockMsg, config);
        expect(res.acted).toBe(true);
        expect(res.actions).toContain('channel_rule:media_only');
        expect(deleted).toBe(true);
    });
});
