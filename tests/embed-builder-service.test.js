/**
 * tests/embed-builder-service.test.js
 *
 * Tests unitaires et d'intégration pour EmbedBuilderService (Phase 12 G40).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { EmbedBuilderRepository } from '../src/modules/util_embed_builder/services/embed-builder.repository.js';
import { EmbedBuilderService } from '../src/modules/util_embed_builder/services/embed-builder.service.js';

describe('Feature G40: Custom Embed Builder Service Tests', () => {
    let repo;
    let service;
    const guildId = 'test_guild_embed_123';
    const channelId = 'chan_annonces_456';

    beforeAll(async () => {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS "custom_embeds" (
                "id" text PRIMARY KEY NOT NULL,
                "guild_id" text NOT NULL,
                "channel_id" text NOT NULL,
                "message_id" text NOT NULL,
                "title" text,
                "description" text,
                "color" text,
                "fields" jsonb,
                "footer" text,
                "thumbnail" text,
                "image" text,
                "author" jsonb,
                "created_at" bigint NOT NULL,
                "updated_at" bigint NOT NULL
            );
        `);
    });

    beforeEach(async () => {
        repo = new EmbedBuilderRepository();
        service = new EmbedBuilderService(repo);
        await db.pool.query(`DELETE FROM custom_embeds WHERE guild_id = $1`, [guildId]);
    });

    it('buildDiscordEmbed should construct valid Discord.js Embed', () => {
        const embed = service.buildDiscordEmbed({
            title: 'Bienvenue sur le serveur',
            description: 'Consultez les règles ci-dessous',
            color: '#FF0055',
            fields: [{ name: 'Règle 1', value: 'Respect', inline: true }],
            footer: 'Pied de page'
        });

        expect(embed.data.title).toBe('Bienvenue sur le serveur');
        expect(embed.data.description).toBe('Consultez les règles ci-dessous');
        expect(embed.data.fields.length).toBe(1);
        expect(embed.data.footer.text).toBe('Pied de page');
    });

    it('postEmbed should send message and save to DB', async () => {
        let sentPayload = null;
        const mockClient = {
            channels: {
                cache: new Map([
                    [channelId, {
                        id: channelId,
                        send: async (p) => {
                            sentPayload = p;
                            return { id: 'msg_discord_789' };
                        }
                    }]
                ])
            }
        };

        const res = await service.postEmbed({
            guildId,
            channelId,
            embedData: {
                title: 'Annonce importante',
                description: 'Maintenance ce soir',
                color: '#5865F2'
            },
            client: mockClient
        });

        expect(res.ok).toBe(true);
        expect(res.data.channelId).toBe(channelId);
        expect(res.data.messageId).toBe('msg_discord_789');
        expect(sentPayload).not.toBeNull();

        const list = await service.listEmbeds(guildId);
        expect(list.length).toBe(1);
        expect(list[0].title).toBe('Annonce importante');
    });

    it('editEmbed should edit discord message and update DB', async () => {
        const created = await repo.insertEmbed({
            guildId,
            channelId,
            messageId: 'msg_discord_edit',
            title: 'Ancien titre',
            description: 'Ancien contenu'
        });

        let editedPayload = null;
        const mockClient = {
            channels: {
                cache: new Map([
                    [channelId, {
                        id: channelId,
                        messages: {
                            fetch: async () => ({
                                edit: async (p) => { editedPayload = p; }
                            })
                        }
                    }]
                ])
            }
        };

        const editRes = await service.editEmbed({
            id: created.id,
            embedData: {
                title: 'Nouveau titre actualisé',
                description: 'Nouveau contenu'
            },
            client: mockClient
        });

        expect(editRes.ok).toBe(true);
        expect(editRes.data.title).toBe('Nouveau titre actualisé');
        expect(editedPayload).not.toBeNull();
    });
});
