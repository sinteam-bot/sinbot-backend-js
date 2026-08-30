/**
 * tests/tickets-advanced.test.js
 *
 * Tests unitaires et d'intégration pour les fonctionnalités avancées des tickets (Module P4).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { TicketRepository } from '../src/modules/community_tickets/services/ticket.repository.js';
import { TicketService } from '../src/modules/community_tickets/services/ticket.service.js';

describe('Specialized Bot Feature P4: Advanced Tickets (Multi-Panels, Ratings, Tags, Auto-Close)', () => {
    let repo;
    let service;
    const guildId = 'test_guild_ticket_123';
    const userId = 'usr_client_456';
    const staffId = 'usr_staff_789';

    beforeAll(async () => {
        try {
            await db.pool.query(`ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "panel_id" text;`);
        } catch (_) {}

        try {
            await db.pool.query(`ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "rating_score" integer;`);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "tickets" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "channel_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "category" text NOT NULL DEFAULT 'support',
                    "subject" text,
                    "status" text NOT NULL DEFAULT 'open',
                    "claimed_by" text,
                    "closed_by" text,
                    "closed_at" bigint,
                    "panel_id" text,
                    "rating_score" integer,
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint NOT NULL
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "ticket_messages" (
                    "id" text PRIMARY KEY NOT NULL,
                    "ticket_id" text NOT NULL,
                    "author_id" text NOT NULL,
                    "content" text,
                    "attachments" text,
                    "is_staff" integer NOT NULL DEFAULT 0,
                    "created_at" bigint NOT NULL
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "ticket_panels" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "name" text NOT NULL,
                    "title" text NOT NULL,
                    "description" text,
                    "channel_id" text,
                    "category_id" text,
                    "role_ids" text DEFAULT '[]' NOT NULL,
                    "form_questions" jsonb,
                    "button_label" text DEFAULT 'Ouvrir un ticket' NOT NULL,
                    "button_emoji" text DEFAULT '📩' NOT NULL,
                    "button_style" text DEFAULT 'Primary' NOT NULL,
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint NOT NULL,
                    CONSTRAINT "ticket_panels_guild_name_unique" UNIQUE("guild_id","name")
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "ticket_ratings" (
                    "id" text PRIMARY KEY NOT NULL,
                    "ticket_id" text NOT NULL,
                    "guild_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "staff_id" text,
                    "rating" integer NOT NULL,
                    "feedback" text,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "ticket_ratings_ticket_unique" UNIQUE("ticket_id")
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "ticket_tags" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "name" text NOT NULL,
                    "content" text NOT NULL,
                    "created_by" text NOT NULL,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "ticket_tags_guild_name_unique" UNIQUE("guild_id","name")
                );
            `);
        } catch (_) {}
    });

    beforeEach(async () => {
        repo = new TicketRepository();
        service = new TicketService();
        service.setRepo(repo);

        await db.pool.query(`DELETE FROM ticket_ratings WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM ticket_tags WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM ticket_panels WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM ticket_messages`);
        await db.pool.query(`DELETE FROM tickets WHERE guild_id = $1`, [guildId]);
    });

    it('should create, list and delete multi-panels', async () => {
        const p1 = await service.createPanel({
            guildId,
            name: 'recrutement',
            title: 'Recrutement Modération',
            description: 'Postulez pour rejoindre l’équipe',
            categoryId: 'cat_recrutement',
            roleIds: ['role_admin'],
            buttonLabel: 'Postuler',
            buttonEmoji: '📝'
        });

        expect(p1.name).toBe('recrutement');
        expect(p1.roleIds).toEqual(['role_admin']);

        const list = await service.listPanels(guildId);
        expect(list.length).toBe(1);

        await service.deletePanel(guildId, 'recrutement');
        const listAfter = await service.listPanels(guildId);
        expect(listAfter.length).toBe(0);
    });

    it('should submit ratings (1-5) and calculate average satisfaction stats', async () => {
        const t1 = await service.create({
            guildId,
            channelId: 'chan_t1',
            userId,
            category: 'support'
        });

        const t2 = await service.create({
            guildId,
            channelId: 'chan_t2',
            userId: 'usr_other',
            category: 'support'
        });

        await service.addRating({
            ticketId: t1.id,
            guildId,
            userId,
            staffId,
            rating: 5,
            feedback: 'Support ultra rapide et efficace !'
        });

        await service.addRating({
            ticketId: t2.id,
            guildId,
            userId: 'usr_other',
            staffId,
            rating: 4,
            feedback: 'Bien'
        });

        const stats = await service.getRatingStats(guildId);
        expect(stats.count).toBe(2);
        expect(stats.average).toBe(4.5);

        const list = await service.listRatings(guildId);
        expect(list.length).toBe(2);
    });

    it('should create, get and delete ticket canned tags', async () => {
        await service.setTag({
            guildId,
            name: 'faq',
            content: 'Consultez la FAQ sur notre site web.',
            createdBy: staffId
        });

        const tag = await service.getTag(guildId, 'faq');
        expect(tag).not.toBeNull();
        expect(tag.content).toBe('Consultez la FAQ sur notre site web.');

        const list = await service.listTags(guildId);
        expect(list.length).toBe(1);

        await service.deleteTag(guildId, 'faq');
        const after = await service.getTag(guildId, 'faq');
        expect(after).toBeNull();
    });

    it('processAutoClose should close inactive tickets', async () => {
        const oldTime = Date.now() - (30 * 3600 * 1000); // 30 heures d'inactivité
        const id = 'ticket_inactive_old';

        await db.pool.query(
            `INSERT INTO tickets (id, guild_id, channel_id, user_id, category, status, created_at, updated_at)
             VALUES ($1, $2, 'chan_old', $3, 'support', 'open', $4, $4)`,
            [id, guildId, userId, oldTime]
        );

        let sentMessage = null;
        const mockClient = {
            channels: {
                cache: new Map([
                    ['chan_old', {
                        id: 'chan_old',
                        send: async (msg) => { sentMessage = msg; }
                    }]
                ])
            }
        };

        const closedCount = await service.processAutoClose(mockClient, { auto_close_hours: 24 });
        expect(closedCount).toBe(1);
        expect(sentMessage).toContain('fermé automatiquement');

        const updated = await service.get(id);
        expect(updated.status).toBe('closed');
        expect(updated.closedBy).toBe('Auto-Close System');
    });
});
