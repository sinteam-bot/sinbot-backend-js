/**
 * tests/tags-service.test.js
 *
 * Tests unitaires et d'intégration pour TagsService (Phase 9 G41).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { TagsRepository } from '../src/modules/util_tags/services/tags.repository.js';
import { TagsService } from '../src/modules/util_tags/services/tags.service.js';

describe('Feature G41: Tags Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_tags_123';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "tags" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "name" text NOT NULL,
                "content" text NOT NULL,
                "uses" integer DEFAULT 0 NOT NULL,
                "created_by" text,
                "created_at" bigint NOT NULL,
                "updated_at" bigint NOT NULL,
                CONSTRAINT "tags_guild_name_unique" UNIQUE("guild_id","name")
            );
        `);
    });

    beforeEach(async () => {
        repo = new TagsRepository();
        service = new TagsService(repo);
        await db.pool.query(`DELETE FROM tags WHERE guild_id = $1`, [guildId]);
    });

    it('should create, get and increment uses of a tag', async () => {
        const created = await service.createTag({
            guildId,
            name: 'regles',
            content: 'Veuillez respecter les membres et pas de spam !',
            createdBy: 'admin_1'
        });

        expect(created.ok).toBe(true);
        expect(created.data.name).toBe('regles');
        expect(created.data.uses).toBe(0);

        // Get tag
        const tag1 = await service.getTag(guildId, 'regles');
        expect(tag1).not.toBeNull();
        expect(tag1.uses).toBe(1);

        const tag2 = await service.getTag(guildId, 'REGLES');
        expect(tag2.uses).toBe(2);
    });

    it('should reject duplicate tag names', async () => {
        await service.createTag({
            guildId,
            name: 'site',
            content: 'https://monsite.com'
        });

        const dup = await service.createTag({
            guildId,
            name: 'site',
            content: 'https://autre.com'
        });

        expect(dup.ok).toBe(false);
        expect(dup.error).toContain('existe déjà');
    });

    it('should list and delete tags', async () => {
        await service.createTag({ guildId, name: 'tag1', content: 'Contenu 1' });
        await service.createTag({ guildId, name: 'tag2', content: 'Contenu 2' });

        const list = await service.listTags(guildId);
        expect(list.length).toBe(2);

        const del = await service.deleteTag(guildId, 'tag1');
        expect(del.ok).toBe(true);

        const listAfter = await service.listTags(guildId);
        expect(listAfter.length).toBe(1);
    });
});
