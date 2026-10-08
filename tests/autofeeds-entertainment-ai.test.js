/**
 * tests/autofeeds-entertainment-ai.test.js
 *
 * Tests unitaires et d'intégration pour les nouveaux providers de flux :
 * - AnimeSphere (Planning Animes & Épisodes)
 * - JustWatch (Nouveautés Séries & Films FR)
 * - AiModels (OpenRouter & Models.dev avec détection de modèles gratuits)
 * - Formats Discord d'affichage (Embed complet vs épisode suivant, bouton direct de streaming).
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import assert from 'node:assert/strict';

import { providerRegistry } from '../src/modules/util_autofeeds/services/providers/provider-registry.js';
import { AnimeSphereFeedProvider } from '../src/modules/util_autofeeds/services/providers/animesphere.provider.js';
import { JustWatchFeedProvider } from '../src/modules/util_autofeeds/services/providers/justwatch.provider.js';
import { AiModelsFeedProvider } from '../src/modules/util_autofeeds/services/providers/ai-models.provider.js';
import { PRESETS } from '../src/modules/util_autofeeds/config/presets.js';
import { AutofeedsService } from '../src/modules/util_autofeeds/services/autofeeds.service.js';

describe('Autofeeds - Entertainment (Anime / Séries / Films) & AI Models Providers', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('ProviderRegistry - Détection & Enregistrement', () => {
        it('doit enregistrer les nouveaux providers avec leurs métadonnées', () => {
            const animesphere = providerRegistry.get('animesphere');
            const justwatch = providerRegistry.get('justwatch');
            const aiModels = providerRegistry.get('ai_models');

            assert.ok(animesphere, 'AnimeSphere doit être enregistré');
            assert.strictEqual(animesphere.name, 'animesphere');
            assert.strictEqual(animesphere.icon, '🌸');

            assert.ok(justwatch, 'JustWatch doit être enregistré');
            assert.strictEqual(justwatch.name, 'justwatch');
            assert.strictEqual(justwatch.icon, '🍿');

            assert.ok(aiModels, 'AiModels doit être enregistré');
            assert.strictEqual(aiModels.name, 'ai_models');
            assert.strictEqual(aiModels.icon, '🤖');
        });

        it('doit détecter automatiquement le provider selon l\'URL cible', () => {
            assert.strictEqual(providerRegistry.detectProvider('https://animesphere.io/planning'), 'animesphere');
            assert.strictEqual(providerRegistry.detectProvider('animesphere:simulcast'), 'animesphere');
            assert.strictEqual(providerRegistry.detectProvider('animesphere'), 'animesphere');

            assert.strictEqual(providerRegistry.detectProvider('https://www.justwatch.com/fr/nouveau'), 'justwatch');
            assert.strictEqual(providerRegistry.detectProvider('justwatch:fr'), 'justwatch');
            assert.strictEqual(providerRegistry.detectProvider('justwatch'), 'justwatch');

            assert.strictEqual(providerRegistry.detectProvider('https://openrouter.ai/api/v1/models?use_rss=true'), 'ai_models');
            assert.strictEqual(providerRegistry.detectProvider('https://models.dev/api.json?type=all'), 'ai_models');
            assert.strictEqual(providerRegistry.detectProvider('https://models.dev/providers/opencode-go/'), 'ai_models');
            assert.strictEqual(providerRegistry.detectProvider('openrouter:models'), 'ai_models');
            assert.strictEqual(providerRegistry.detectProvider('modelsdev:opencode'), 'ai_models');
        });
    });

    describe('AnimeSphereFeedProvider', () => {
        it('doit résoudre l\'URL par défaut vers https://animesphere.io/planning', () => {
            const provider = new AnimeSphereFeedProvider();
            assert.strictEqual(provider.resolveUrl(''), 'https://animesphere.io/planning');
            assert.strictEqual(provider.resolveUrl('animesphere'), 'https://animesphere.io/planning');
            assert.strictEqual(provider.resolveUrl('https://animesphere.io/planning'), 'https://animesphere.io/planning');
        });

        it('doit parser les données Nuxt SSR et distinguer 1er épisode/film vs récurrent', async () => {
            const provider = new AnimeSphereFeedProvider();

            // Simuler la réponse Nuxt 3 de animesphere.io
            const fakeNuxtArray = [
                "Sousou no Frieren", // 0
                "Crunchyroll", // 1
                "Dans un monde fantastique, l'elfe Frieren...", // 2
                {
                    title: 0,
                    slug: "frieren",
                    anilistId: 154587,
                    description: 2,
                    imageUrl: "https://example.com/frieren.jpg",
                    platforms: [1],
                    format: "TV",
                    episodeNumber: 1,
                    isFirstEpisode: true,
                    season: "Automne",
                    seasonYear: 2024,
                    genres: ["Aventure", "Fantastique"]
                },
                "One Piece", // 4
                {
                    title: 4,
                    slug: "one-piece",
                    anilistId: 21,
                    description: "Luffy continue son voyage...",
                    imageUrl: "https://example.com/op.jpg",
                    platforms: [1],
                    format: "TV",
                    episodeNumber: 1120,
                    isFirstEpisode: false,
                    season: "Continu",
                    seasonYear: 2024,
                    genres: ["Action"]
                }
            ];

            const htmlContent = `<html><head><script type="application/json" id="__NUXT_DATA__">${JSON.stringify(fakeNuxtArray)}</script></head><body>AnimeSphere</body></html>`;

            global.fetch = async (url) => {
                const urlStr = String(url);
                if (urlStr.includes('animesphere.io')) {
                    return {
                        ok: true,
                        status: 200,
                        text: async () => htmlContent
                    };
                }
                if (urlStr.includes('graphql.anilist.co')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            data: {
                                Media: {
                                    title: {
                                        romaji: "Sousou no Frieren",
                                        english: "Frieren: Beyond Journey's End",
                                        native: "葬送のフリーレン"
                                    }
                                }
                            }
                        })
                    };
                }
                throw new Error(`URL inattendue: ${urlStr}`);
            };

            const items = await provider.fetchItems({ feedUrl: 'https://animesphere.io/planning' });
            assert.strictEqual(items.length, 2);

            // Item 1 : Premier épisode de Frieren
            const frieren = items[0];
            assert.strictEqual(frieren.extra.isFirstEpisodeOrMovie, true);
            assert.strictEqual(frieren.extra.titleFr, 'Sousou no Frieren');
            assert.strictEqual(frieren.extra.titleEn, "Frieren: Beyond Journey's End");
            assert.strictEqual(frieren.extra.titleRomaji, "Sousou no Frieren");
            assert.strictEqual(frieren.extra.titleJp, "葬送のフリーレン");
            assert.deepStrictEqual(frieren.extra.platforms, ['Crunchyroll']);
            assert.ok(frieren.title.includes('🌸 [Nouveau]'));
            assert.strictEqual(frieren.content, "Dans un monde fantastique, l'elfe Frieren...");

            // Item 2 : Épisode récurrent One Piece (1120)
            const onePiece = items[1];
            assert.strictEqual(onePiece.extra.isFirstEpisodeOrMovie, false);
            assert.strictEqual(onePiece.extra.episodeNumber, 1120);
            assert.ok(onePiece.title.includes('📺 One Piece - Épisode 1120'));
        });
    });

    describe('JustWatchFeedProvider', () => {
        it('doit résoudre l\'URL par défaut vers https://www.justwatch.com/fr/nouveau', () => {
            const provider = new JustWatchFeedProvider();
            assert.strictEqual(provider.resolveUrl(''), 'https://www.justwatch.com/fr/nouveau');
            assert.strictEqual(provider.resolveUrl('justwatch'), 'https://www.justwatch.com/fr/nouveau');
        });

        it('doit requêter GraphQL JustWatch et formater les nouveautés séries et films', async () => {
            const provider = new JustWatchFeedProvider();

            const fakeGraphQLResponse = {
                data: {
                    newTitles: {
                        edges: [
                            {
                                node: {
                                    id: 'ts12345',
                                    objectType: 'MOVIE',
                                    content: {
                                        title: 'Dune: Deuxième Partie',
                                        shortDescription: 'Paul Atréides s\'unit à Chani et aux Fremen...',
                                        originalReleaseYear: 2024,
                                        posterUrl: '/poster/12345/{profile}/dune-2.{format}'
                                    },
                                    offers: [
                                        {
                                            package: { clearName: 'Canal+' },
                                            standardWebURL: 'https://www.canalplus.com/dune-2'
                                        }
                                    ]
                                }
                            },
                            {
                                node: {
                                    id: 'ts67890',
                                    objectType: 'SHOW',
                                    content: {
                                        title: 'Saison 1',
                                        shortDescription: 'L\'histoire d\'un détective dans Tokyo...',
                                        originalReleaseYear: 2024,
                                        posterUrl: '/poster/67890/{profile}/tokyo-vice.{format}'
                                    },
                                    show: {
                                        id: 'sh999',
                                        content: {
                                            title: 'Tokyo Vice',
                                            originalReleaseYear: 2024,
                                            shortDescription: 'Un journaliste américain infiltré...'
                                        }
                                    },
                                    offers: [
                                        {
                                            package: { clearName: 'Max' },
                                            standardWebURL: 'https://www.max.com/tokyo-vice'
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            };

            global.fetch = async (url) => {
                return {
                    ok: true,
                    status: 200,
                    json: async () => fakeGraphQLResponse
                };
            };

            const items = await provider.fetchItems({ feedUrl: 'https://www.justwatch.com/fr/nouveau' });
            assert.strictEqual(items.length, 2);

            // 1. Film Dune 2
            const movie = items[0];
            assert.strictEqual(movie.extra.mediaType, 'movie');
            assert.strictEqual(movie.extra.isFirstEpisodeOrMovie, true);
            assert.strictEqual(movie.extra.titleFr, 'Dune: Deuxième Partie');
            assert.strictEqual(movie.imageUrl, 'https://images.justwatch.com/poster/12345/s592/dune-2.webp');
            assert.deepStrictEqual(movie.extra.platforms, ['Canal+']);
            assert.ok(movie.title.includes('🎬 [Film] Dune: Deuxième Partie (2024)'));

            // 2. Série Saison 1 Tokyo Vice
            const show = items[1];
            assert.strictEqual(show.extra.mediaType, 'series');
            assert.strictEqual(show.extra.isFirstEpisodeOrMovie, true);
            assert.strictEqual(show.extra.titleFr, 'Tokyo Vice');
            assert.deepStrictEqual(show.extra.platforms, ['Max']);
            assert.ok(show.title.includes('🍿 [Nouvelle Série] Tokyo Vice - Saison 1'));
        });
    });

    describe('AiModelsFeedProvider (OpenRouter & Models.dev)', () => {
        it('doit traiter le flux RSS OpenRouter et détecter les modèles gratuits', async () => {
            const provider = new AiModelsFeedProvider();

            const fakeRss = `
                <rss version="2.0">
                    <channel>
                        <title>OpenRouter Models</title>
                        <item>
                            <title>deepseek/deepseek-r1:free</title>
                            <description>DeepSeek R1 reasoning model offered for free.</description>
                            <link>https://openrouter.ai/models/deepseek-r1-free</link>
                            <guid>deepseek-r1-free</guid>
                            <pubDate>Mon, 08 Oct 2026 12:00:00 GMT</pubDate>
                        </item>
                        <item>
                            <title>anthropic/claude-3-5-sonnet</title>
                            <description>Advanced reasoning and vision capabilities.</description>
                            <link>https://openrouter.ai/models/claude-3-5-sonnet</link>
                            <guid>claude-3-5-sonnet</guid>
                            <pubDate>Mon, 08 Oct 2026 10:00:00 GMT</pubDate>
                        </item>
                    </channel>
                </rss>
            `;

            global.fetch = async () => ({
                ok: true,
                status: 200,
                text: async () => fakeRss
            });

            const items = await provider.fetchItems({ feedUrl: 'https://openrouter.ai/api/v1/models?use_rss=true' });
            assert.strictEqual(items.length, 2);

            assert.strictEqual(items[0].extra.isFree, true);
            assert.ok(items[0].title.includes('🆓 [Gratuit] deepseek/deepseek-r1:free'));

            assert.strictEqual(items[1].extra.isFree, false);
            assert.ok(items[1].title.includes('🤖 [Nouveau Modèle] anthropic/claude-3-5-sonnet'));
        });

        it('doit analyser Models.dev et identifier les modèles gratuits d\'OpenCode Go', async () => {
            const provider = new AiModelsFeedProvider();

            const fakeModelsDevJson = {
                "opencode-go": {
                    id: "opencode-go",
                    name: "OpenCode Go",
                    doc: "https://opencode.net/go",
                    models: {
                        "space-bunny-free": {
                            id: "space-bunny-free",
                            name: "Space Bunny Free",
                            cost: { input: 0, output: 0 },
                            limit: { context: 131072 },
                            reasoning: true,
                            tool_call: true,
                            release_date: "2026-10-01"
                        },
                        "opencode-coder-pro": {
                            id: "opencode-coder-pro",
                            name: "OpenCode Coder Pro",
                            cost: { input: 0.15, output: 0.60 },
                            limit: { context: 262144 },
                            reasoning: false,
                            tool_call: true,
                            release_date: "2026-09-15"
                        }
                    }
                },
                "deepinfra": {
                    id: "deepinfra",
                    name: "DeepInfra",
                    models: {
                        "llama-3-8b": {
                            id: "llama-3-8b",
                            name: "Llama 3 8B",
                            cost: { input: 0.05, output: 0.05 },
                            release_date: "2026-08-01"
                        }
                    }
                }
            };

            global.fetch = async () => ({
                ok: true,
                status: 200,
                json: async () => fakeModelsDevJson
            });

            // 1. Test ciblé sur OpenCode Go
            const opencodeItems = await provider.fetchItems({ feedUrl: 'https://models.dev/api.json?provider=opencode-go' });
            assert.strictEqual(opencodeItems.length, 2);

            const freeModel = opencodeItems.find(m => m.extra.modelId === 'space-bunny-free');
            assert.ok(freeModel, 'Le modèle gratuit space-bunny-free doit exister');
            assert.strictEqual(freeModel.extra.isFree, true);
            assert.strictEqual(freeModel.extra.costLabel, '🆓 Gratuit (0$/1M tokens)');
            assert.strictEqual(freeModel.extra.reasoning, true);
            assert.strictEqual(freeModel.extra.contextTokens, '128k');
            assert.ok(freeModel.title.includes('🆓 [IA Gratuite] Space Bunny Free (OpenCode Go)'));

            // 2. Test avec filtre freeOnly=true
            const freeOnlyItems = await provider.fetchItems({ feedUrl: 'https://models.dev/api.json?freeOnly=true' });
            assert.strictEqual(freeOnlyItems.length, 1);
            assert.strictEqual(freeOnlyItems[0].extra.modelId, 'space-bunny-free');
        });
    });

    describe('Catalogue de Presets', () => {
        it('doit inclure les nouveaux presets prêts à l\'emploi pour AnimeSphere, JustWatch et IA', () => {
            const animespherePreset = PRESETS.find(p => p.id === 'animesphere-planning');
            assert.ok(animespherePreset, 'Preset AnimeSphere manquant');
            assert.strictEqual(animespherePreset.provider, 'animesphere');
            assert.strictEqual(animespherePreset.category, 'anime');

            const justwatchPreset = PRESETS.find(p => p.id === 'justwatch-nouveau');
            assert.ok(justwatchPreset, 'Preset JustWatch manquant');
            assert.strictEqual(justwatchPreset.provider, 'justwatch');
            assert.strictEqual(justwatchPreset.category, 'cinema');

            const openrouterPreset = PRESETS.find(p => p.id === 'openrouter-new-models');
            assert.ok(openrouterPreset, 'Preset OpenRouter manquant');
            assert.strictEqual(openrouterPreset.provider, 'ai_models');
            assert.strictEqual(openrouterPreset.category, 'ai');

            const opencodePreset = PRESETS.find(p => p.id === 'modelsdev-opencode');
            assert.ok(opencodePreset, 'Preset OpenCode Go manquant');
            assert.strictEqual(opencodePreset.provider, 'ai_models');

            const allFreePreset = PRESETS.find(p => p.id === 'modelsdev-all-free');
            assert.ok(allFreePreset, 'Preset Models.dev Free Only manquant');
            assert.strictEqual(allFreePreset.provider, 'ai_models');
        });
    });

    describe('AutofeedsService - Embed & ActionRow spécialisés', () => {
        const service = new AutofeedsService();

        it('doit formater l\'embed complet pour un 1er épisode d\'anime avec Romaji et Anglais', () => {
            const feed = { name: 'Anime Watch', feedType: 'animesphere', color: '#FF70A6', tags: ['anime'] };
            const item = {
                title: '🌸 [Nouveau] Sousou no Frieren (Épisode 1)',
                link: 'https://crunchyroll.com/frieren',
                content: 'L\'aventure de Frieren commence.',
                imageUrl: 'https://example.com/poster.jpg',
                source: 'animesphere',
                extra: {
                    mediaType: 'anime',
                    isFirstEpisodeOrMovie: true,
                    titleFr: 'Sousou no Frieren',
                    titleEn: "Frieren: Beyond Journey's End",
                    titleRomaji: 'Sousou no Frieren',
                    titleJp: '葬送のフリーレン',
                    platforms: ['Crunchyroll', 'ADN'],
                    format: 'TV',
                    season: 'Automne',
                    seasonYear: 2024,
                    episodeCount: 28,
                    studios: 'Madhouse'
                }
            };

            const embed = service.buildDiscordEmbed(feed, item);
            const data = embed.toJSON();

            assert.ok(data.title.includes('Sousou no Frieren'));
            assert.strictEqual(data.description, 'L\'aventure de Frieren commence.');
            assert.strictEqual(data.image.url, 'https://example.com/poster.jpg');

            const enField = data.fields.find(f => f.name.includes('Anglais'));
            assert.ok(enField, 'Champ Titre Anglais présent');
            assert.strictEqual(enField.value, "`Frieren: Beyond Journey's End`");

            const jpField = data.fields.find(f => f.name.includes('Original'));
            assert.ok(jpField, 'Champ Titre Original présent');

            const platformsField = data.fields.find(f => f.name.includes('Plateforme'));
            assert.ok(platformsField, 'Champ Plateformes présent');
            assert.ok(platformsField.value.includes('Crunchyroll'));

            // ActionRow avec bouton regarder
            const row = service.buildActionRow(feed, item);
            const rowData = row.toJSON();
            const streamButton = rowData.components[0];
            assert.strictEqual(streamButton.label, '▶️ Regarder sur Crunchyroll');
            assert.strictEqual(streamButton.url, 'https://crunchyroll.com/frieren');
        });

        it('doit formater un modèle IA avec bouton de test gratuit', () => {
            const feed = { name: 'Veille IA', feedType: 'ai_models', color: '#6366F1' };
            const item = {
                title: '🆓 [IA Gratuite] Space Bunny Free (OpenCode Go)',
                link: 'https://models.dev/providers/opencode-go',
                content: 'Modèle gratuit puissant.',
                source: 'models_dev',
                extra: {
                    providerName: 'OpenCode Go',
                    modelName: 'Space Bunny Free',
                    isFree: true,
                    costLabel: '🆓 Gratuit (0$/1M tokens)',
                    contextTokens: '128k',
                    reasoning: true,
                    toolCalling: true
                }
            };

            const embed = service.buildDiscordEmbed(feed, item);
            const data = embed.toJSON();

            const costField = data.fields.find(f => f.name.includes('Tarification'));
            assert.ok(costField);
            assert.strictEqual(costField.value, '🆓 Gratuit (0$/1M tokens)');

            const capsField = data.fields.find(f => f.name.includes('Capacités'));
            assert.ok(capsField);
            assert.ok(capsField.value.includes('Thinking'));

            const row = service.buildActionRow(feed, item);
            const button = row.toJSON().components[0];
            assert.strictEqual(button.label, '🆓 Tester gratuitement');
        });
    });
});
