/**
 * tests/autofeeds-service.test.js
 *
 * Tests unitaires pour AutofeedsService (Phase 14 G23).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { AutofeedsRepository } from '../src/modules/util_autofeeds/services/autofeeds.repository.js';
import { AutofeedsService } from '../src/modules/util_autofeeds/services/autofeeds.service.js';

describe('Feature G23: Autofeeds RSS & Atom Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_feed_123';
    const channelId = 'chan_feed_456';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "autofeeds" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "channel_id" text NOT NULL,
                "feed_url" text NOT NULL,
                "feed_type" text DEFAULT 'rss' NOT NULL,
                "last_item_id" text,
                "last_item_published_at" bigint DEFAULT 0 NOT NULL,
                "interval_minutes" integer DEFAULT 15 NOT NULL,
                "enabled" boolean DEFAULT true NOT NULL,
                "created_at" bigint NOT NULL
            );
        `);
    });

    beforeEach(async () => {
        repo = new AutofeedsRepository();
        service = new AutofeedsService(repo);
        await db.pool.query(`DELETE FROM autofeeds WHERE guild_id = $1`, [guildId]);
    });

    it('should add, list and delete autofeeds', async () => {
        const add = await service.addFeed({
            guildId,
            channelId,
            feedUrl: 'https://example.com/rss.xml',
            intervalMinutes: 30
        });

        expect(add.ok).toBe(true);
        expect(add.data.channelId).toBe(channelId);

        const list = await service.listFeeds(guildId);
        expect(list.length).toBe(1);

        await service.deleteFeed(add.data.id);
        const listAfter = await service.listFeeds(guildId);
        expect(listAfter.length).toBe(0);
    });

    it('parseFeedXml should extract RSS items properly', () => {
        const sampleXml = `
            <rss version="2.0">
                <channel>
                    <title>Sample Feed</title>
                    <item>
                        <title>Nouvelle version 2.0 disponible</title>
                        <link>https://example.com/news/v2</link>
                        <guid>guid-12345</guid>
                        <pubDate>Sun, 30 Aug 2026 04:00:00 GMT</pubDate>
                    </item>
                </channel>
            </rss>
        `;

        const items = service.parseFeedXml(sampleXml);
        expect(items.length).toBe(1);
        expect(items[0].title).toBe('Nouvelle version 2.0 disponible');
        expect(items[0].link).toBe('https://example.com/news/v2');
        expect(items[0].id).toBe('guid-12345');
    });
});
