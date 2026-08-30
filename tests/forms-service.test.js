/**
 * tests/forms-service.test.js
 *
 * Tests unitaires et d'intégration pour FormsService (Phase 14 G21).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { FormsRepository } from '../src/modules/util_forms/services/forms.repository.js';
import { FormsService } from '../src/modules/util_forms/services/forms.service.js';

describe('Feature G21: Forms Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_form_123';
    const channelId = 'chan_form_results_456';

    beforeAll(async () => {
        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "forms" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "name" text NOT NULL,
                    "title" text NOT NULL,
                    "description" text,
                    "channel_id" text NOT NULL,
                    "questions_json" jsonb NOT NULL,
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint NOT NULL,
                    CONSTRAINT "forms_guild_name_unique" UNIQUE("guild_id","name")
                );
            `);
        } catch (_) {}

        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "form_submissions" (
                    "id" text PRIMARY KEY NOT NULL,
                    "form_id" text NOT NULL,
                    "guild_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "answers_json" jsonb NOT NULL,
                    "created_at" bigint NOT NULL
                );
            `);
        } catch (_) {}
    });

    beforeEach(async () => {
        repo = new FormsRepository();
        service = new FormsService(repo);
        await db.pool.query(`DELETE FROM form_submissions WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM forms WHERE guild_id = $1`, [guildId]);
    });

    it('should create form, list and retrieve by name', async () => {
        const res = await service.createForm({
            guildId,
            name: 'recrutement',
            title: 'Recrutement Modérateur',
            description: 'Postulez ici',
            channelId,
            questions: [
                { id: 'age', label: 'Votre âge' },
                { id: 'motivation', label: 'Vos motivations' }
            ]
        });

        expect(res.ok).toBe(true);
        expect(res.data.name).toBe('recrutement');

        const form = await service.getForm('recrutement', guildId);
        expect(form).not.toBeNull();
        expect(form.title).toBe('Recrutement Modérateur');
        expect(form.questions.length).toBe(2);
    });

    it('submitForm should save submission and post embed to channel', async () => {
        const created = await repo.createForm({
            guildId,
            name: 'sondage',
            title: 'Sondage d\'avis',
            channelId,
            questions: [{ id: 'avis', label: 'Votre avis' }]
        });

        let sentPayload = null;
        const mockClient = {
            channels: {
                cache: new Map([
                    [channelId, {
                        id: channelId,
                        send: async (payload) => {
                            sentPayload = payload;
                        }
                    }]
                ])
            }
        };

        const subRes = await service.submitForm({
            formId: created.id,
            guildId,
            userId: 'user_respondent_789',
            answers: { 'Votre avis': 'Super bot !' },
            client: mockClient
        });

        expect(subRes.ok).toBe(true);
        expect(sentPayload).not.toBeNull();

        const subs = await service.listSubmissions(created.id);
        expect(subs.length).toBe(1);
        expect(subs[0].userId).toBe('user_respondent_789');
        expect(subs[0].answers['Votre avis']).toBe('Super bot !');
    });
});
