/**
 * tests/autofeeds-advanced.test.js
 *
 * Tests unitaires et d'intégration pour les flux avancés (LootScraper, multi-sources, souscriptions, filtres).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../src/db/index.js';
import { AutofeedsRepository } from '../src/modules/util_autofeeds/services/autofeeds.repository.js';
import { AutofeedsSubscriptionService } from '../src/modules/util_autofeeds/services/autofeeds-subscription.service.js';
import { AutofeedsService } from '../src/modules/util_autofeeds/services/autofeeds.service.js';
import { providerRegistry } from '../src/modules/util_autofeeds/services/providers/provider-registry.js';
import { PRESETS } from '../src/modules/util_autofeeds/config/presets.js';
import { AutofeedsController, AutofeedsWebhooksController } from '../src/modules/util_autofeeds/controllers/autofeeds.controller.js';
import { AutofeedCommands } from '../src/modules/util_autofeeds/commands/autofeed.cmd.js';
import { AutofeedInteractionListener } from '../src/modules/util_autofeeds/events/autofeed-interaction.listener.js';
import { AutofeedsAiService } from '../src/modules/util_autofeeds/services/autofeeds-ai.service.js';
import { AutofeedsWebhookService } from '../src/modules/util_autofeeds/services/autofeeds-webhook.service.js';
import { AutofeedsOpmlService } from '../src/modules/util_autofeeds/services/autofeeds-opml.service.js';
import { AutofeedsGamificationService } from '../src/modules/util_autofeeds/services/autofeeds-gamification.service.js';
import { AutofeedsRateLimitService } from '../src/modules/util_autofeeds/services/autofeeds-ratelimit.service.js';
import { AutofeedsDigestService } from '../src/modules/util_autofeeds/services/autofeeds-digest.service.js';

describe('Autofeeds Advanced: Multi-Source, LootScraper & Subscriptions', () => {
    let repo;
    let subService;
    let service;
    let controller;

    const guildId = 'guild_loot_test_777';
    const channelId = 'chan_loot_888';

    beforeAll(async () => {
        repo = new AutofeedsRepository();
        await repo.initSchema();
    });

    beforeEach(async () => {
        repo = new AutofeedsRepository();
        subService = new AutofeedsSubscriptionService(repo);
        service = new AutofeedsService(repo, subService);
        controller = new AutofeedsController(service, subService);

        await db.pool.query(`DELETE FROM autofeeds WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM autofeed_subscriptions WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM autofeed_claims WHERE guild_id = $1`, [guildId]);
        await db.pool.query(`DELETE FROM autofeed_history WHERE feed_id LIKE 'feed_test_%'`);
        await db.pool.query(`DELETE FROM autofeed_live_sessions WHERE feed_id LIKE '%test%'`);
    });

    // ---------------------------------------------------------------
    // 1. Providers & Resolution
    // ---------------------------------------------------------------
    describe('Provider Registry & Resolution', () => {
        it('detects correct providers by URL pattern', () => {
            expect(providerRegistry.detectProvider('https://www.youtube.com/channel/UC1234567890123456789012')).toBe('youtube');
            expect(providerRegistry.detectProvider('https://reddit.com/r/FreeGameFindings')).toBe('reddit');
            expect(providerRegistry.detectProvider('r/GameDeals')).toBe('reddit');
            expect(providerRegistry.detectProvider('https://news.google.com/rss/search?q=gaming')).toBe('google_news');
            expect(providerRegistry.detectProvider('https://eikowagenknecht.com/lootscraper/epic-games.xml')).toBe('rss');
        });

        it('resolves YouTube channel ID and playlist to proper RSS URLs', () => {
            const ytProvider = providerRegistry.get('youtube');
            const resolved = ytProvider.resolveUrl('UC1234567890123456789012');
            expect(resolved).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890123456789012');
        });

        it('resolves Reddit subreddits to .rss endpoints', () => {
            const redditProvider = providerRegistry.get('reddit');
            expect(redditProvider.resolveUrl('r/FreeGameFindings')).toBe('https://www.reddit.com/r/FreeGameFindings/new.rss');
        });

        it('resolves Google News text search queries', () => {
            const gnProvider = providerRegistry.get('google_news');
            const resolved = gnProvider.resolveUrl('jeux video');
            expect(resolved).toContain('news.google.com/rss/search?q=jeux%20video');
        });
    });

    // ---------------------------------------------------------------
    // 2. LootScraper Presets
    // ---------------------------------------------------------------
    describe('LootScraper Presets Catalog', () => {
        it('contains LootScraper presets with gaming categories and tags', () => {
            expect(PRESETS.length).toBeGreaterThanOrEqual(6);
            const epicPreset = PRESETS.find(p => p.id === 'lootscraper-epic');
            expect(epicPreset).toBeDefined();
            expect(epicPreset.feedUrl).toContain('epic-games.xml');
            expect(epicPreset.category).toBe('gaming');
            expect(epicPreset.tags).toContain('epic');
            expect(epicPreset.tags).toContain('free');
        });

        it('installs a LootScraper preset in 1-click', async () => {
            const installed = await service.installPreset(guildId, channelId, 'lootscraper-epic');
            expect(installed.ok).toBe(true);
            expect(installed.data.category).toBe('gaming');
            expect(installed.data.tags).toContain('epic');

            const list = await service.listFeeds(guildId);
            expect(list.length).toBe(1);
            expect(list[0].feedUrl).toContain('epic-games.xml');
        });
    });

    // ---------------------------------------------------------------
    // 3. Filtering Logic (includeKeywords, excludeKeywords, regex)
    // ---------------------------------------------------------------
    describe('Filters matching (include, exclude, regex)', () => {
        const rssProvider = providerRegistry.get('rss');

        it('matches includeKeywords correctly', () => {
            const item = { title: 'Borderlands 3 gratuit sur Epic Games Store', content: 'Offre temporaire' };

            expect(rssProvider.matchesFilters(item, { includeKeywords: ['borderlands'] })).toBe(true);
            expect(rssProvider.matchesFilters(item, { includeKeywords: ['cyberpunk'] })).toBe(false);
        });

        it('rejects excludeKeywords correctly', () => {
            const item = { title: 'Dlc payant pour game X', content: 'Skins à 5€' };

            expect(rssProvider.matchesFilters(item, { excludeKeywords: ['payant', 'dlc'] })).toBe(false);
            expect(rssProvider.matchesFilters(item, { excludeKeywords: ['free', 'giveaway'] })).toBe(true);
        });

        it('supports regexFilter', () => {
            const item = { title: 'Steam [Free] Game Title', content: 'Description' };

            expect(rssProvider.matchesFilters(item, { regexFilter: '\\[free\\]' })).toBe(true);
            expect(rssProvider.matchesFilters(item, { regexFilter: 'beta test' })).toBe(false);
        });
    });

    // ---------------------------------------------------------------
    // 4. Subscriptions & Notifications Matching
    // ---------------------------------------------------------------
    describe('Subscriptions & Alert Matching', () => {
        it('allows users to subscribe and unsubscribe to tags, categories and keywords', async () => {
            const sub = await subService.subscribe({
                guildId,
                userId: 'user_gamer_1',
                targetType: 'tag',
                targetValue: 'epic',
                notifyMode: 'mention'
            });
            expect(sub.ok).toBe(true);

            const userSubs = await subService.listUserSubscriptions(guildId, 'user_gamer_1');
            expect(userSubs.length).toBe(1);
            expect(userSubs[0].targetValue).toBe('epic');

            const unsub = await subService.unsubscribe({
                guildId,
                userId: 'user_gamer_1',
                targetType: 'tag',
                targetValue: 'epic'
            });
            expect(unsub.deleted).toBe(true);

            const subsAfter = await subService.listUserSubscriptions(guildId, 'user_gamer_1');
            expect(subsAfter.length).toBe(0);
        });

        it('matches subscribers by tag, category and keyword', async () => {
            // Utilisateur 1 abonné au tag "steam"
            await subService.subscribe({
                guildId,
                userId: 'user_steam_lover',
                targetType: 'tag',
                targetValue: 'steam',
                notifyMode: 'mention'
            });

            // Utilisateur 2 abonné à la catégorie "gaming" en DM
            await subService.subscribe({
                guildId,
                userId: 'user_category_dm',
                targetType: 'category',
                targetValue: 'gaming',
                notifyMode: 'dm'
            });

            // Utilisateur 3 abonné au mot-clé "gta"
            await subService.subscribe({
                guildId,
                userId: 'user_gta_fan',
                targetType: 'keyword',
                targetValue: 'gta',
                notifyMode: 'mention'
            });

            // Article A : jeu Steam sans mot clé GTA
            const feed = {
                id: 'feed_1',
                guildId,
                category: 'gaming',
                tags: ['steam', 'free']
            };
            const itemA = {
                id: 'item_1',
                title: 'Half-Life 2 offert sur Steam',
                content: 'Offre anniversaire Valve',
                tags: ['valve']
            };

            const matchA = await subService.findMatchingSubscribers(guildId, feed, itemA);
            expect(matchA.mentionUserIds).toContain('user_steam_lover');
            expect(matchA.dmUserIds).toContain('user_category_dm');
            expect(matchA.mentionUserIds).not.toContain('user_gta_fan');

            // Article B : deal GTA
            const itemB = {
                id: 'item_2',
                title: 'GTA V Édition Premium gratuite',
                content: 'Rockstar Games giveaway',
                tags: ['epic']
            };

            const matchB = await subService.findMatchingSubscribers(guildId, feed, itemB);
            expect(matchB.mentionUserIds).toContain('user_gta_fan');
            expect(matchB.dmUserIds).toContain('user_category_dm');
        });
    });

    // ---------------------------------------------------------------
    // 5. REST API Controller
    // ---------------------------------------------------------------
    describe('Autofeeds REST Controller', () => {
        it('lists presets, providers and feeds via controller endpoints', async () => {
            const presetsRes = await controller.getPresets();
            expect(presetsRes.success).toBe(true);
            expect(presetsRes.data.length).toBeGreaterThan(0);

            const providersRes = await controller.getProviders();
            expect(providersRes.success).toBe(true);
            expect(providersRes.data.some(p => p.name === 'youtube')).toBe(true);

            // Créer via controller
            const createRes = await controller.create({
                body: {
                    guild_id: guildId,
                    channel_id: channelId,
                    feed_url: 'https://eikowagenknecht.com/lootscraper/epic-games.xml',
                    name: 'Test Controller Feed',
                    category: 'gaming',
                    tags: ['epic', 'free']
                }
            });
            expect(createRes.ok).toBe(true);

            // Lister
            const listRes = await controller.list({ query: { guild_id: guildId } });
            expect(listRes.success).toBe(true);
            expect(listRes.data.length).toBe(1);

            // Créer souscription
            const subRes = await controller.createSubscription({
                body: {
                    guild_id: guildId,
                    user_id: 'user_controller_sub',
                    target_type: 'tag',
                    target_value: 'epic',
                    notify_mode: 'mention'
                }
            });
            expect(subRes.ok).toBe(true);

            // Supprimer souscription
            const delSubRes = await controller.deleteSubscription({ params: { id: subRes.data.id } });
            expect(delSubRes.ok).toBe(true);
        });
    });

    // ---------------------------------------------------------------
    // 6. Anti-doublons & Embed Discord
    // ---------------------------------------------------------------
    describe('Embed Formatting & Action Row', () => {
        it('generates rich Discord embed with tags and color', () => {
            const feed = {
                id: 'feed_test_embed',
                name: 'Epic Loot',
                feedType: 'rss',
                category: 'gaming',
                tags: ['epic', 'free'],
                color: '#2580EB'
            };
            const item = {
                id: 'item_123',
                title: 'Jeu Gratuit de la Semaine',
                link: 'https://epicgames.com/free',
                content: 'Super jeu gratuit à récupérer d\'urgence.',
                author: 'Epic Store',
                publishedAt: Date.now(),
                imageUrl: 'https://example.com/banner.jpg',
                tags: ['pc']
            };

            const embed = service.buildDiscordEmbed(feed, item);
            expect(embed.data.title).toContain('Jeu Gratuit de la Semaine');
            expect(embed.data.url).toBe('https://epicgames.com/free');
            expect(embed.data.image.url).toBe('https://example.com/banner.jpg');

            const actionRow = service.buildActionRow(feed, item);
            expect(actionRow).toBeDefined();
            expect(actionRow.components.length).toBe(3);
            expect(actionRow.components[0].data.label).toBe("Voir l'article");
            expect(actionRow.components[1].data.custom_id).toContain('autofeed:sub:tag:epic');
            expect(actionRow.components[2].data.custom_id).toContain('autofeed:sub:author:epic store');
        });
    });

    // ---------------------------------------------------------------
    // 7. Advanced Filters (titleKeywords, authors, tags, media)
    // ---------------------------------------------------------------
    describe('Advanced Filter Capabilities', () => {
        const provider = providerRegistry.get('rss');

        it('filters specifically on titleKeywords and excludeTitleKeywords', () => {
            const item = { title: 'PlayStation 5 Pro Disponible', content: 'Le stock est limité en magasin.' };

            expect(provider.matchesFilters(item, { titleKeywords: ['playstation'] })).toBe(true);
            expect(provider.matchesFilters(item, { titleKeywords: ['xbox'] })).toBe(false);
            expect(provider.matchesFilters(item, { excludeTitleKeywords: ['magasin'] })).toBe(true);
            expect(provider.matchesFilters(item, { excludeTitleKeywords: ['pro'] })).toBe(false);
        });

        it('filters by author whitelist and blacklist', () => {
            const item = { title: 'Nouvelle annonce', content: 'Contenu', author: '@Zerator' };

            expect(provider.matchesFilters(item, { authorInclude: ['zerator'] })).toBe(true);
            expect(provider.matchesFilters(item, { authorInclude: ['squeezie'] })).toBe(false);
            expect(provider.matchesFilters(item, { authorExclude: ['automoderator', 'bot'] })).toBe(true);
            expect(provider.matchesFilters(item, { authorExclude: ['zerator'] })).toBe(false);
        });

        it('filters by tags and requireMedia', () => {
            const itemWithImg = {
                title: 'Jeu avec image',
                content: 'Description',
                imageUrl: 'https://example.com/art.jpg',
                tags: ['steam', 'rpg']
            };
            const itemNoImg = {
                title: 'Jeu sans image',
                content: 'Description',
                imageUrl: null,
                tags: ['indie']
            };

            expect(provider.matchesFilters(itemWithImg, { requireMedia: true })).toBe(true);
            expect(provider.matchesFilters(itemNoImg, { requireMedia: true })).toBe(false);
            expect(provider.matchesFilters(itemWithImg, { tagInclude: ['steam'] })).toBe(true);
            expect(provider.matchesFilters(itemWithImg, { tagExclude: ['rpg'] })).toBe(false);
        });
    });

    // ---------------------------------------------------------------
    // 8. Social Feed Providers & Resolution
    // ---------------------------------------------------------------
    describe('Social Feed Providers (Twitter, TikTok, Twitch, Kick, Bridges)', () => {
        it('registers all 16 providers in registry', () => {
            const list = providerRegistry.list();
            expect(list.length).toBe(16);
            const names = list.map(p => p.name);
            expect(names).toContain('rss');
            expect(names).toContain('youtube');
            expect(names).toContain('youtube_live');
            expect(names).toContain('reddit');
            expect(names).toContain('google_news');
            expect(names).toContain('twitch');
            expect(names).toContain('kick');
            expect(names).toContain('twitter');
            expect(names).toContain('tiktok');
            expect(names).toContain('instagram');
            expect(names).toContain('facebook');
            expect(names).toContain('linkedin');
            expect(names).toContain('bluesky');
            expect(names).toContain('github');
            expect(names).toContain('gitlab');
            expect(names).toContain('statuspage');
        });

        it('resolves Twitter handles and URLs to Nitter RSS gateway', () => {
            const twitterProv = providerRegistry.get('twitter');
            expect(twitterProv.extractUsername('https://x.com/PlayStation')).toBe('PlayStation');
            expect(twitterProv.resolveUrl('@Xbox')).toContain('/Xbox/rss');
        });

        it('resolves TikTok creators to ProxiTok RSS gateway', () => {
            const tiktokProv = providerRegistry.get('tiktok');
            expect(tiktokProv.extractUsername('https://www.tiktok.com/@khaby.lame')).toBe('khaby.lame');
            expect(tiktokProv.resolveUrl('@khaby.lame')).toContain('/@khaby.lame/rss');
        });

        it('resolves Twitch and Kick usernames', () => {
            const twitchProv = providerRegistry.get('twitch');
            expect(twitchProv.extractUsername('https://www.twitch.tv/zerator')).toBe('zerator');
            expect(twitchProv.resolveUrl('zerator')).toBe('https://www.twitch.tv/zerator');

            const kickProv = providerRegistry.get('kick');
            expect(kickProv.extractUsername('kick:xqc')).toBe('xqc');
            expect(kickProv.resolveUrl('xqc')).toBe('https://kick.com/xqc');
        });

        it('supports author/account subscriber matching with personal regex filter', async () => {
            await subService.subscribe({
                guildId,
                userId: 'user_author_fan',
                targetType: 'account',
                targetValue: 'playstation',
                notifyMode: 'mention',
                filters: {
                    regexFilter: 'state of play'
                }
            });

            const feed = { id: 'feed_soc', guildId, category: 'news', tags: [] };
            const itemMatch = {
                id: 't1',
                title: 'Nouveau State of Play annoncé pour jeudi',
                content: 'Diffusion en direct',
                author: '@PlayStation'
            };
            const itemNoMatch = {
                id: 't2',
                title: 'Remise sur la manette DualSense',
                content: 'Offre promotionnelle',
                author: '@PlayStation'
            };

            const match1 = await subService.findMatchingSubscribers(guildId, feed, itemMatch);
            expect(match1.mentionUserIds).toContain('user_author_fan');

            const match2 = await subService.findMatchingSubscribers(guildId, feed, itemNoMatch);
            expect(match2.mentionUserIds).not.toContain('user_author_fan');
        });

        it('handles streamer live alerts and subscriber notification for Twitch/Kick/YouTube', async () => {
            const ytProv = providerRegistry.get('youtube');
            expect(ytProv.extractHandleOrChannel('https://www.youtube.com/@Zerator')).toEqual({ type: 'handle', value: 'Zerator' });
            expect(ytProv.extractHandleOrChannel('@Zerator')).toEqual({ type: 'handle', value: 'Zerator' });
            expect(ytProv.extractHandleOrChannel('UC1234567890123456789012')).toEqual({ type: 'channelId', value: 'UC1234567890123456789012' });

            // Abonnement au tag global "live"
            await subService.subscribe({
                guildId,
                userId: 'user_live_watcher',
                targetType: 'tag',
                targetValue: 'live',
                notifyMode: 'mention'
            });

            // Abonnement direct au streamer "zerator" en DM
            await subService.subscribe({
                guildId,
                userId: 'user_streamer_fan',
                targetType: 'account',
                targetValue: 'zerator',
                notifyMode: 'dm'
            });

            const liveFeed = { id: 'feed_twitch_zerator', guildId, category: 'gaming', tags: ['stream'] };
            const twitchLiveItem = {
                id: 'twitch:zerator:stream_999999',
                title: '🔴 [LIVE] ZeratoR est en direct sur Twitch !',
                content: 'Soirée découverte jeux indés',
                link: 'https://www.twitch.tv/zerator',
                author: 'ZeratoR',
                tags: ['twitch', 'live', 'stream', 'zerator']
            };

            const matches = await subService.findMatchingSubscribers(guildId, liveFeed, twitchLiveItem);
            expect(matches.mentionUserIds).toContain('user_live_watcher');
            expect(matches.dmUserIds).toContain('user_streamer_fan');
            expect(matches.matchedTags).toContain('live');
        });
    });

    // ---------------------------------------------------------------
    // 9. Live Stream Sessions Lifecycle & In-place Offline Editing
    // ---------------------------------------------------------------
    describe('Live Stream Sessions Lifecycle & In-place Offline Editing', () => {
        it('saves and retrieves active live sessions in repository', async () => {
            const feedId = 'feed_test_live_twitch';
            const streamId = 'stream_live_12345';

            const saved = await repo.saveLiveSession({
                feedId,
                streamId,
                streamerName: 'ZeratoR',
                channelId: 'chan_live_99',
                messageId: 'msg_discord_111',
                title: 'Découverte de nouveaux jeux',
                game: 'Trackmania',
                url: 'https://www.twitch.tv/zerator',
                startedAt: Date.now() - 3600000 // 1 heure plus tôt
            });

            expect(saved.status).toBe('live');
            expect(saved.streamerName).toBe('ZeratoR');

            const active = await repo.getActiveLiveSession(feedId);
            expect(active).not.toBeNull();
            expect(active.streamId).toBe(streamId);
            expect(active.game).toBe('Trackmania');

            // Fermeture de session
            await repo.closeLiveSession(active.id, { game: 'Trackmania Cup' });
            const afterClose = await repo.getActiveLiveSession(feedId);
            expect(afterClose).toBeNull();
        });

        it('handles stream online by posting message with custom placeholders and saving live session', async () => {
            const feed = {
                id: 'feed_test_streamer',
                guildId,
                channelId: 'chan_stream_alerts',
                feedUrl: 'https://www.twitch.tv/zerator',
                name: 'ZeratoR Twitch',
                feedType: 'twitch',
                category: 'gaming',
                tags: ['stream', 'live'],
                filters: {},
                customMessage: '🔴 ALERTE LIVE ! {streamer} joue à {game} pour {viewers} spectateurs ! Regarde ici: {url} {mentions}',
                color: '#9146FF',
                pingRoleId: 'role_stream_ping'
            };

            const twitchProv = providerRegistry.get('twitch');
            const streamItem = {
                id: 'twitch:zerator:stream_unique_001',
                title: '🔴 [LIVE] ZeratoR est en direct sur Twitch !',
                content: 'Tournoi Trackmania Cup',
                link: 'https://www.twitch.tv/zerator',
                author: 'ZeratoR',
                publishedAt: Date.now(),
                tags: ['twitch', 'live', 'stream', 'zerator'],
                extra: {
                    game: 'Trackmania',
                    viewers: 15420
                }
            };

            let sentPayload = null;
            const mockChannel = {
                send: async (payload) => {
                    sentPayload = payload;
                    return { id: 'discord_msg_live_777' };
                }
            };

            const mockClient = {
                channels: {
                    cache: new Map([['chan_stream_alerts', mockChannel]]),
                    fetch: async () => mockChannel
                },
                users: {
                    fetch: async () => null
                }
            };

            await service._handleLiveStreamOnline(feed, mockClient, twitchProv, streamItem);

            expect(sentPayload).not.toBeNull();
            expect(sentPayload.content).toContain('ZeratoR');
            expect(sentPayload.content).toContain('Trackmania');
            expect(sentPayload.content).toContain('15420');
            expect(sentPayload.content).toContain('<@&role_stream_ping>');
            expect(sentPayload.embeds.length).toBe(1);

            // Vérifier que la session live a été enregistrée
            const active = await repo.getActiveLiveSession(feed.id);
            expect(active).not.toBeNull();
            expect(active.messageId).toBe('discord_msg_live_777');
            expect(active.streamerName).toBe('ZeratoR');
        });

        it('handles stream offline by updating Discord message in-place to OFFLINE without ghost-ping', async () => {
            const feed = {
                id: 'feed_test_offline_flow',
                guildId,
                channelId: 'chan_stream_alerts',
                feedUrl: 'https://www.twitch.tv/zerator',
                feedType: 'twitch'
            };

            const startedAt = Date.now() - (2 * 3600000 + 15 * 60000); // 2h 15m
            await repo.saveLiveSession({
                feedId: feed.id,
                streamId: 'twitch:zerator:stream_unique_002',
                streamerName: 'ZeratoR',
                channelId: 'chan_stream_alerts',
                messageId: 'discord_msg_live_888',
                title: 'Session Trackmania',
                game: 'Trackmania',
                url: 'https://www.twitch.tv/zerator',
                startedAt
            });

            let editedPayload = null;
            const mockMsg = {
                edit: async (payload) => {
                    editedPayload = payload;
                    return mockMsg;
                }
            };

            const mockChannel = {
                messages: {
                    fetch: async (id) => (id === 'discord_msg_live_888' ? mockMsg : null)
                }
            };

            const mockClient = {
                channels: {
                    cache: new Map([['chan_stream_alerts', mockChannel]]),
                    fetch: async () => mockChannel
                }
            };

            const twitchProv = providerRegistry.get('twitch');
            await service._handleLiveStreamOffline(feed, mockClient, twitchProv);

            expect(editedPayload).not.toBeNull();
            // Le texte de mention est vidé pour supprimer le ghost-ping
            expect(editedPayload.content.trim()).toBe('');
            expect(editedPayload.embeds.length).toBe(1);
            expect(editedPayload.embeds[0].data.title).toContain('⚫ [OFFLINE]');
            expect(editedPayload.embeds[0].data.title).toContain('ZeratoR');

            // Vérification des champs de durée et jeu
            const fields = editedPayload.embeds[0].data.fields || [];
            const durationField = fields.find(f => f.name.includes('Durée'));
            expect(durationField).toBeDefined();
            expect(durationField.value).toContain('2h 15min');

            // Bouton replay
            expect(editedPayload.components.length).toBe(1);

            // Vérifier que la session a été fermée en base
            const active = await repo.getActiveLiveSession(feed.id);
            expect(active).toBeNull();
        });
    });

    // ---------------------------------------------------------------
    // 10. Webhooks: Twitch EventSub & YouTube WebSub
    // ---------------------------------------------------------------
    describe('Twitch EventSub & YouTube WebSub Webhooks', () => {
        let webhooksCtrl;

        beforeEach(() => {
            webhooksCtrl = new AutofeedsWebhooksController(service);
        });

        it('validates Twitch EventSub webhook challenge verification', async () => {
            const req = {
                headers: {
                    'twitch-eventsub-message-type': 'webhook_callback_verification'
                },
                body: {
                    challenge: 'test_twitch_challenge_xyz_999',
                    subscription: {
                        type: 'stream.online',
                        condition: { broadcaster_user_id: '123456' }
                    }
                }
            };

            let sentText = null;
            let sentStatus = null;
            const res = {
                status: (code) => {
                    sentStatus = code;
                    return {
                        send: (txt) => {
                            sentText = txt;
                            return txt;
                        }
                    };
                }
            };

            const result = await controller.handleTwitchWebhook(req, res);
            expect(sentStatus).toBe(200);
            expect(sentText).toBe('test_twitch_challenge_xyz_999');

            // Via le contrôleur dédié /api/webhooks
            const webhooksResult = await webhooksCtrl.handleTwitchWebhook(req, res);
            expect(sentText).toBe('test_twitch_challenge_xyz_999');
        });

        it('dispatches Twitch EventSub notification for stream.online and stream.offline', async () => {
            // Créer un feed Twitch pour zerator
            await repo.addFeed({
                guildId,
                channelId: 'chan_twitch_eventsub',
                feedUrl: 'https://www.twitch.tv/zerator',
                name: 'ZeratoR',
                feedType: 'twitch',
                intervalMinutes: 2
            });

            let eventSubResult = null;
            service.handleTwitchEventSub = async (type, event) => {
                eventSubResult = { type, event };
                return { ok: true, matched: 1 };
            };

            const req = {
                headers: {
                    'twitch-eventsub-message-type': 'notification'
                },
                body: {
                    subscription: {
                        type: 'stream.online'
                    },
                    event: {
                        broadcaster_user_login: 'zerator',
                        broadcaster_user_name: 'ZeratoR',
                        title: 'Soirée spéciale',
                        started_at: new Date().toISOString()
                    }
                }
            };

            const res = await controller.handleTwitchWebhook(req);
            expect(res.success).toBe(true);
            expect(eventSubResult).not.toBeNull();
            expect(eventSubResult.type).toBe('stream.online');
            expect(eventSubResult.event.broadcaster_user_login).toBe('zerator');
        });

        it('validates YouTube WebSub GET hub.challenge', async () => {
            const req = {
                query: {
                    'hub.mode': 'subscribe',
                    'hub.topic': 'https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCxxxx',
                    'hub.challenge': 'youtube_challenge_token_456'
                }
            };

            let sentText = null;
            let sentStatus = null;
            const res = {
                status: (code) => {
                    sentStatus = code;
                    return {
                        send: (txt) => {
                            sentText = txt;
                            return txt;
                        }
                    };
                }
            };

            await controller.handleYouTubeChallenge(req, res);
            expect(sentStatus).toBe(200);
            expect(sentText).toBe('youtube_challenge_token_456');

            await webhooksCtrl.handleYouTubeChallenge(req, res);
            expect(sentText).toBe('youtube_challenge_token_456');
        });

        it('processes YouTube WebSub POST notification XML payload', async () => {
            let processedXml = null;
            service.handleYouTubeWebSub = async (xml) => {
                processedXml = xml;
                return { ok: true, matched: 1 };
            };

            const xmlNotification = `
                <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
                    <title>YouTube video feed</title>
                    <entry>
                        <yt:videoId>dQw4w9WgXcQ</yt:videoId>
                        <yt:channelId>UCuAXFkgsw1L7xaCfnd5JJOw</yt:channelId>
                        <title>Never Gonna Give You Up</title>
                        <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
                    </entry>
                </feed>
            `;

            const req = {
                body: xmlNotification
            };

            const res = await controller.handleYouTubeNotification(req);
            expect(res.success).toBe(true);
            expect(processedXml).toContain('dQw4w9WgXcQ');
        });
    });

    // ---------------------------------------------------------------
    // 11. Stream Options, Threads, Roles, Delivery & Health Circuit Breaker
    // ---------------------------------------------------------------
    describe('Stream Threads, Dedicated Roles, Delivery Modes & Health Check', () => {
        it('saves and updates createThread, subscriberRoleId, and notificationDelivery', async () => {
            const addRes = await service.addFeed({
                guildId,
                channelId,
                feedUrl: 'https://twitch.tv/ninja',
                name: 'Ninja Stream',
                category: 'live',
                createThread: true,
                threadAutoArchiveDuration: 1440,
                subscriberRoleId: 'role_ninja_sub',
                notificationDelivery: 'both'
            });

            expect(addRes.ok).toBe(true);
            expect(addRes.data.createThread).toBe(true);
            expect(addRes.data.subscriberRoleId).toBe('role_ninja_sub');
            expect(addRes.data.notificationDelivery).toBe('both');
            expect(addRes.data.threadAutoArchiveDuration).toBe(1440);

            // Fetch from repo
            const fetched = await service.getFeed(addRes.data.id);
            expect(fetched.createThread).toBe(true);
            expect(fetched.subscriberRoleId).toBe('role_ninja_sub');
            expect(fetched.notificationDelivery).toBe('both');

            // Update
            const updated = await service.updateFeed(addRes.data.id, {
                createThread: false,
                subscriberRoleId: 'role_ninja_updated',
                notificationDelivery: 'role'
            });

            expect(updated.ok).toBe(true);
            expect(updated.data.createThread).toBe(false);
            expect(updated.data.subscriberRoleId).toBe('role_ninja_updated');
            expect(updated.data.notificationDelivery).toBe('role');
        });

        it('supports both and role notificationDelivery subscription modes', async () => {
            const addRes = await service.addFeed({
                guildId,
                channelId,
                feedUrl: 'https://twitch.tv/shroud',
                name: 'Shroud Stream',
                category: 'live',
                tags: ['fps', 'shroud']
            });

            const feedId = addRes.data.id;

            const subRole = await subService.subscribe({
                guildId,
                userId: 'user_fan_1',
                targetType: 'feed',
                targetValue: feedId,
                notifyMode: 'role'
            });
            expect(subRole.ok).toBe(true);
            expect(subRole.data.notifyMode).toBe('role');

            const subBoth = await subService.subscribe({
                guildId,
                userId: 'user_fan_2',
                targetType: 'feed',
                targetValue: feedId,
                notifyMode: 'both'
            });
            expect(subBoth.ok).toBe(true);
            expect(subBoth.data.notifyMode).toBe('both');

            const item = {
                title: 'Shroud is live playing Valorant',
                content: 'Tune in!',
                tags: ['fps']
            };

            const feed = await service.getFeed(feedId);
            const matching = await subService.findMatchingSubscribers(guildId, feed, item);
            expect(matching.mentionUserIds).toContain('user_fan_1');
            expect(matching.mentionUserIds).toContain('user_fan_2');
            expect(matching.dmUserIds).toContain('user_fan_2');
        });

        it('auto-disables feed after 10 consecutive check failures (circuit breaker)', async () => {
            const addRes = await service.addFeed({
                guildId,
                channelId,
                feedUrl: 'https://example.com/broken.xml',
                name: 'Broken Feed'
            });

            const feedId = addRes.data.id;

            // Fail 9 times: should remain active
            for (let i = 1; i <= 9; i++) {
                await repo.recordFeedCheckResult(feedId, { status: 'error', error: `Network error ${i}` });
                const feed = await repo.getFeedById(feedId);
                expect(feed.isActive).toBe(true);
                expect(feed.failCount).toBe(i);
            }

            // 10th failure: should be auto-disabled
            await repo.recordFeedCheckResult(feedId, { status: 'error', error: 'Fatal 10th error' });
            const finalFeed = await repo.getFeedById(feedId);
            expect(finalFeed.failCount).toBe(10);
            expect(finalFeed.isActive).toBe(false);
            expect(finalFeed.lastStatus).toBe('error');
        });

        it('handles /feed streamers and /feed pause commands', async () => {
            const cmd = new AutofeedCommands(service, subService);

            // executeStreamers when empty
            let replyData = null;
            const mockEmptyInteraction = {
                guild: { id: guildId },
                reply: async (data) => {
                    replyData = data;
                    return data;
                }
            };

            await cmd.executeStreamers(mockEmptyInteraction);
            expect(replyData.content).toContain('Aucun streamer ou direct configuré');

            // Add a live stream feed
            const addRes = await service.addFeed({
                guildId,
                channelId,
                feedUrl: 'https://twitch.tv/kamet0',
                name: 'Kameto Stream',
                category: 'live'
            });

            await cmd.executeStreamers(mockEmptyInteraction);
            expect(replyData.embeds).toBeDefined();
            expect(replyData.embeds[0].data.title).toContain('Statut des Streamers');

            // executePause toggles active state
            let pauseReply = null;
            const mockPauseInteraction = {
                member: {
                    permissions: {
                        has: () => true
                    }
                },
                options: {
                    getString: (key) => key === 'id' ? addRes.data.id : null
                },
                reply: async (data) => {
                    pauseReply = data;
                    return data;
                }
            };

            await cmd.executePause(mockPauseInteraction);
            expect(pauseReply.content).toContain('mis en pause');

            const pausedFeed = await repo.getFeedById(addRes.data.id);
            expect(pausedFeed.isActive).toBe(false);

            await cmd.executePause(mockPauseInteraction);
            expect(pauseReply.content).toContain('réactivé');

            const resumedFeed = await repo.getFeedById(addRes.data.id);
            expect(resumedFeed.isActive).toBe(true);
        });
    });

    // ---------------------------------------------------------------
    // 12. Améliorations Avancées : Bluesky, Shorts, Media Proxy, OPML, AI, Webhooks, /feed menu
    // ---------------------------------------------------------------
    describe('12. Améliorations Avancées (Bluesky, Shorts, Media Proxy, OPML, AI, Webhooks, Menu)', () => {
        it('supports Bluesky AT Protocol handles and RSS endpoint resolution', () => {
            const bskyProv = providerRegistry.get('bluesky');
            expect(bskyProv).toBeDefined();

            expect(providerRegistry.detectProvider('https://bsky.app/profile/jay.bsky.team')).toBe('bluesky');
            expect(providerRegistry.detectProvider('bsky.app/profile/alice.bsky.social')).toBe('bluesky');

            expect(bskyProv.extractUsername('https://bsky.app/profile/jay.bsky.team')).toBe('jay.bsky.team');
            expect(bskyProv.extractUsername('@bob.bsky.social')).toBe('bob.bsky.social');

            const resolved = bskyProv.resolveUrl('https://bsky.app/profile/jay.bsky.team');
            expect(resolved).toBe('https://bsky.app/profile/jay.bsky.team/rss');
        });

        it('filters YouTube Shorts when ignoreShorts is enabled', async () => {
            const ytProv = providerRegistry.get('youtube');

            const regularVideo = {
                id: 'yt:video1',
                title: 'Guide complet Elden Ring',
                link: 'https://www.youtube.com/watch?v=abc12345',
                content: 'Voici un tutoriel complet de 30 minutes.'
            };

            const shortVideoHash = {
                id: 'yt:video2',
                title: 'Best combo #shorts #gaming',
                link: 'https://www.youtube.com/watch?v=def67890',
                content: 'Incroyable combo !'
            };

            const shortVideoUrl = {
                id: 'yt:video3',
                title: 'Quick reflex test',
                link: 'https://www.youtube.com/shorts/ghi99999',
                content: 'Trop rapide !'
            };

            expect(ytProv.isShort(regularVideo)).toBe(false);
            expect(ytProv.isShort(shortVideoHash)).toBe(true);
            expect(ytProv.isShort(shortVideoUrl)).toBe(true);

            // Feed with ignoreShorts = true
            const feedIgnoring = {
                id: 'feed_yt_ignore',
                guildId,
                channelId,
                feedType: 'youtube',
                ignoreShorts: true
            };

            const filteredIgnoring = service._filterItems(feedIgnoring, [regularVideo, shortVideoHash, shortVideoUrl]);
            expect(filteredIgnoring.length).toBe(1);
            expect(filteredIgnoring[0].id).toBe('yt:video1');

            // Feed with ignoreShorts = false
            const feedKeeping = {
                id: 'feed_yt_keep',
                guildId,
                channelId,
                feedType: 'youtube',
                ignoreShorts: false
            };

            const filteredKeeping = service._filterItems(feedKeeping, [regularVideo, shortVideoHash, shortVideoUrl]);
            expect(filteredKeeping.length).toBe(3);
        });

        it('proxies Twitter/X and TikTok links for native Discord rich media embeds', () => {
            expect(service.getProxiedMediaLink('https://twitter.com/PlayStation/status/123456789'))
                .toBe('https://fxtwitter.com/PlayStation/status/123456789');

            expect(service.getProxiedMediaLink('https://x.com/Nintendo/status/987654321'))
                .toBe('https://fxtwitter.com/Nintendo/status/987654321');

            expect(service.getProxiedMediaLink('https://www.tiktok.com/@creator/video/1122334455'))
                .toBe('https://vxtiktok.com/@creator/video/1122334455');

            expect(service.getProxiedMediaLink('https://vm.tiktok.com/ZM8abcde/'))
                .toBe('https://vm.vxtiktok.com/ZM8abcde/');

            // Other links remain untouched
            expect(service.getProxiedMediaLink('https://store.steampowered.com/app/123/'))
                .toBe('https://store.steampowered.com/app/123/');
        });

        it('generates and parses OPML XML with roundtrip import and export', async () => {
            const opmlService = new AutofeedsOpmlService();

            const testFeeds = [
                {
                    name: 'Steam News',
                    feedUrl: 'https://store.steampowered.com/feeds/news.xml',
                    category: 'gaming',
                    channelId: 'chan_1'
                },
                {
                    name: 'Elden Ring Subreddit',
                    feedUrl: 'https://reddit.com/r/EldenRing/.rss',
                    category: 'reddit',
                    channelId: 'chan_2'
                }
            ];

            const xml = opmlService.generateOpml(testFeeds, 'ChienneBot Subscriptions');
            expect(xml).toContain('<opml version="2.0">');
            expect(xml).toContain('ChienneBot Subscriptions');
            expect(xml).toContain('xmlUrl="https://store.steampowered.com/feeds/news.xml"');
            expect(xml).toContain('xmlUrl="https://reddit.com/r/EldenRing/.rss"');

            const parsed = await opmlService.parseOpml(xml);
            expect(parsed.length).toBe(2);
            expect(parsed[0].title).toBe('Steam News');
            expect(parsed[0].xmlUrl).toBe('https://store.steampowered.com/feeds/news.xml');
            expect(parsed[0].category).toBe('gaming');

            // Test import via service
            const importRes = await service.importOpml({
                opmlXml: xml,
                channelId,
                guildId
            });
            expect(importRes.importedCount).toBe(2);
            expect(importRes.errors.length).toBe(0);

            // Test export via service
            const exportedXml = await service.exportOpml(guildId);
            expect(exportedXml).toContain('https://store.steampowered.com/feeds/news.xml');
            expect(exportedXml).toContain('https://reddit.com/r/EldenRing/.rss');

            // Test controller endpoints
            const mockReq = {
                body: { opmlXml: xml, channelId, guildId },
                headers: { 'x-guild-id': guildId },
                query: {}
            };
            let jsonOutput = null;
            const mockRes = {
                json: (data) => { jsonOutput = data; return data; },
                setHeader: () => {},
                send: (data) => { jsonOutput = data; return data; }
            };

            const ctrlImport = await controller.importOpml(mockReq, mockRes);
            expect((ctrlImport || jsonOutput).success).toBe(true);

            await controller.exportOpml({ ...mockReq, query: { guild_id: guildId } }, mockRes);
            expect(jsonOutput).toContain('<opml version="2.0">');
        });

        it('generates AI summaries and French translations with caching', async () => {
            const mockCallAi = async (prompt) => {
                if (prompt.includes('TL;DR')) {
                    return '• Nouvelle mise à jour majeure déployée\n• Améliorations de performances et corrections de bugs';
                }
                if (prompt.includes('Traduire en français')) {
                    return 'TITRE: Mise à jour majeure v2.0\nCONTENU: Voici les détails de la nouvelle mise à jour v2.0 disponible dès maintenant.';
                }
                return 'Mock AI response';
            };

            const aiService = new AutofeedsAiService(mockCallAi);

            const item = {
                title: 'Major Update v2.0 Released',
                content: 'Here are all the patch notes for the big v2.0 release available today.'
            };

            const res = await aiService.generateSummaryAndTranslation(item);
            expect(res.summary).toContain('mise à jour majeure');
            expect(res.translatedTitle).toBe('Mise à jour majeure v2.0');
            expect(res.translatedContent).toContain('Voici les détails');

            // Cache check: calling again shouldn't re-trigger callAi if cache works
            let aiCallCount = 0;
            const countingAi = new AutofeedsAiService(async () => {
                aiCallCount++;
                return '• Point 1\n• Point 2';
            });

            await countingAi.generateSummaryAndTranslation({ title: 'Test 1', content: 'Text 1' });
            expect(aiCallCount).toBeGreaterThan(0);
            const countAfterFirst = aiCallCount;

            await countingAi.generateSummaryAndTranslation({ title: 'Test 1', content: 'Text 1' });
            expect(aiCallCount).toBe(countAfterFirst); // Cache hit!
        });

        it('creates/fetches Discord webhooks and sends messages with creator impersonation', async () => {
            const webhookService = new AutofeedsWebhookService();

            let createdWebhook = null;
            let webhookSentPayload = null;

            const mockCreatedWebhook = {
                id: 'wh_test_123',
                name: 'ChienneBot-Autofeeds',
                send: async (payload) => {
                    webhookSentPayload = payload;
                    return { id: 'msg_wh_456' };
                }
            };

            const mockChannel = {
                id: 'chan_webhook_target',
                fetchWebhooks: async () => new Map(), // No webhooks yet
                createWebhook: async (options) => {
                    createdWebhook = options;
                    return mockCreatedWebhook;
                }
            };

            const payload = {
                content: 'Nouveau live en cours !',
                embeds: [{ title: 'Stream en direct' }]
            };

            const impersonation = {
                name: 'Gotaga',
                avatar: 'https://images.example.com/gotaga.png'
            };

            const sent = await webhookService.sendViaWebhook(mockChannel, payload, impersonation);
            expect(sent).not.toBeNull();
            expect(createdWebhook.name).toBe('ChienneBot-Autofeeds');
            expect(webhookSentPayload.username).toBe('Gotaga');
            expect(webhookSentPayload.avatarURL).toBe('https://images.example.com/gotaga.png');
            expect(webhookSentPayload.content).toBe('Nouveau live en cours !');

            // Second call uses cached webhook without calling createWebhook again
            createdWebhook = null;
            await webhookService.sendViaWebhook(mockChannel, payload, impersonation);
            expect(createdWebhook).toBeNull(); // Cache hit!
        });

        it('provides interactive /feed menu and handles StringSelectMenu subscriptions', async () => {
            // Add two feeds for testing menu
            const feed1 = await service.addFeed({
                guildId,
                channelId,
                feedUrl: 'https://youtube.com/c/test',
                name: 'YouTube Actu',
                feedType: 'youtube',
                subscriberRoleId: 'role_yt_fan'
            });

            const feed2 = await service.addFeed({
                guildId,
                channelId,
                feedUrl: 'https://twitch.tv/test',
                name: 'Twitch Live',
                feedType: 'twitch'
            });

            const cmd = new AutofeedCommands(service, subService);

            let menuReply = null;
            const mockMenuInteraction = {
                guild: { id: guildId },
                reply: async (data) => {
                    menuReply = data;
                    return data;
                }
            };

            await cmd.executeMenu(mockMenuInteraction);
            expect(menuReply).toBeDefined();
            expect(menuReply.embeds[0].data.title).toContain('Menu Interactif d\'Abonnements');
            expect(menuReply.components.length).toBe(1);

            const selectMenuComponent = menuReply.components[0].components[0];
            expect(selectMenuComponent.data.custom_id).toBe('autofeed:select_menu');
            expect(selectMenuComponent.options.length).toBe(2);

            // Test interaction listener when user selects feed1 and feed2 in the select menu
            const listener = new AutofeedInteractionListener(subService, service);

            let assignedRole = null;
            let interactionReply = null;

            const mockSelectInteraction = {
                isStringSelectMenu: () => true,
                customId: 'autofeed:select_menu',
                values: [feed1.data.id, feed2.data.id],
                guildId,
                user: { id: 'user_select_subscriber' },
                member: {
                    roles: {
                        add: async (roleId) => {
                            assignedRole = roleId;
                        }
                    }
                },
                reply: async (data) => {
                    interactionReply = data;
                    return data;
                }
            };

            await listener.handle(mockSelectInteraction);
            expect(interactionReply.content).toContain('Vous êtes désormais abonné à **2** flux');
            expect(assignedRole).toBe('role_yt_fan');

            // Verify subscriptions are saved in DB
            const userSubs = await subService.listUserSubscriptions(guildId, 'user_select_subscriber');
            expect(userSubs.length).toBe(2);
            const targetValues = userSubs.map(s => s.targetValue);
            expect(targetValues).toContain(feed1.data.id);
        });
    });

    // ---------------------------------------------------------------
    // 13. v3 Enhancements (GitHub/GitLab/Statuspage, Tag Routing, Quiet Hours, Gamification, Digest, Analytics)
    // ---------------------------------------------------------------
    describe('13. v3 Enhancements: Developer Providers, Tag Routing, Quiet Hours, Gamification, Digest, Analytics', () => {
        it('detects and resolves GitHub, GitLab and Statuspage feeds', () => {
            const ghProvider = providerRegistry.get('github');
            const glProvider = providerRegistry.get('gitlab');
            const spProvider = providerRegistry.get('statuspage');

            expect(ghProvider).toBeDefined();
            expect(glProvider).toBeDefined();
            expect(spProvider).toBeDefined();

            // Provider auto-detection
            expect(providerRegistry.detectProvider('https://github.com/torvalds/linux')).toBe('github');
            expect(providerRegistry.detectProvider('torvalds/linux')).toBe('github');
            expect(providerRegistry.detectProvider('https://gitlab.com/gitlab-org/gitlab')).toBe('gitlab');
            expect(providerRegistry.detectProvider('https://discordstatus.com')).toBe('statuspage');

            // URL resolution
            expect(ghProvider.resolveUrl('torvalds/linux')).toBe('https://github.com/torvalds/linux/releases.atom');
            expect(ghProvider.resolveUrl('https://github.com/torvalds/linux/tags')).toBe('https://github.com/torvalds/linux/tags.atom');
            expect(glProvider.resolveUrl('gitlab-org/gitlab')).toBe('https://gitlab.com/gitlab-org/gitlab/-/tags?format=atom');
            expect(spProvider.resolveUrl('https://discordstatus.com')).toBe('https://discordstatus.com/history.rss');

            // Tagging
            const ghTags = ghProvider.tagItem({ title: 'v1.0.0 Release' });
            expect(ghTags).toContain('#github');
            expect(ghTags).toContain('#release');

            const spTags = spProvider.tagItem({ title: 'API Outage Degraded' });
            expect(spTags).toContain('#status');
            expect(spTags).toContain('#incident');
            expect(spTags).toContain('#degraded');
        });

        it('routes items to specific Discord channels based on matched tags', () => {
            const mockFeed = {
                id: 'feed_routing_1',
                channelId: 'chan_default',
                channelTagRouting: {
                    '#ps5': 'chan_playstation',
                    'switch': 'chan_nintendo'
                },
                tags: []
            };

            // Item with matching #ps5 tag -> routes to chan_playstation
            const itemPs5 = { title: 'PS5 Free Game', tags: ['#deal', '#ps5'] };
            expect(service.resolveTargetChannel(mockFeed, itemPs5)).toBe('chan_playstation');

            // Item with matching switch tag -> routes to chan_nintendo
            const itemSwitch = { title: 'Mario Kart Discount', tags: ['switch', 'exclusive'] };
            expect(service.resolveTargetChannel(mockFeed, itemSwitch)).toBe('chan_nintendo');

            // Item with non-matching tag -> falls back to chan_default
            const itemPc = { title: 'Steam Sale', tags: ['#pc', '#steam'] };
            expect(service.resolveTargetChannel(mockFeed, itemPc)).toBe('chan_default');
        });

        it('manages quiet hours and sliding window rate limiting', () => {
            const rateLimit = new AutofeedsRateLimitService();

            const quietFeed = {
                quietHours: {
                    enabled: true,
                    start: '22:00',
                    end: '08:00',
                    suppressMentions: true
                }
            };

            // Quiet hours testing: 23:30 (inside) vs 14:00 (outside)
            const nightTime = new Date('2026-10-08T23:30:00');
            const dayTime = new Date('2026-10-08T14:00:00');

            expect(rateLimit.isQuietTime(quietFeed, nightTime)).toBe(true);
            expect(rateLimit.isQuietTime(quietFeed, dayTime)).toBe(false);
            expect(rateLimit.shouldSuppressMentions(quietFeed, nightTime)).toBe(true);
            expect(rateLimit.shouldSuppressMentions(quietFeed, dayTime)).toBe(false);

            // Rate limit testing: max 2 posts per hour
            const feedId = 'feed_ratelimit_test';
            rateLimit.resetRateLimit(feedId);

            expect(rateLimit.checkRateLimit(feedId, 2)).toBe(true);
            expect(rateLimit.checkRateLimit(feedId, 2)).toBe(true);
            // 3rd post within same hour is blocked
            expect(rateLimit.checkRateLimit(feedId, 2)).toBe(false);

            // Resetting rate limit restores capacity
            rateLimit.resetRateLimit(feedId);
            expect(rateLimit.checkRateLimit(feedId, 2)).toBe(true);
        });

        it('awards XP and tracks claims with Drop Hunter gamification', async () => {
            const feedRes = await service.addFeed({
                guildId,
                channelId,
                name: 'Freebies Drop Hunter',
                feedUrl: 'https://example.com/loot.xml',
                feedType: 'rss',
                enableGamification: true,
                gamificationXpReward: 50
            });
            const feed = feedRes.data;

            // Build action row and verify claim button is present
            const item = { id: 'loot_epic_game_123', title: 'Cyberpunk Free on Epic' };
            const row = service.buildActionRow(feed, item);
            expect(row).not.toBeNull();
            const claimBtn = row.components.find(c => c.data.custom_id?.startsWith('autofeed:claim:'));
            expect(claimBtn).toBeDefined();

            // First claim by user_hunter_1
            const claim1 = await service.claimItem(feed.id, item.id, 'user_hunter_1', guildId);
            expect(claim1.alreadyClaimed).toBe(false);
            expect(claim1.claimsCount).toBe(1);
            expect(claim1.xpAwarded).toBe(50);

            // Duplicate claim by user_hunter_1
            const claimDup = await service.claimItem(feed.id, item.id, 'user_hunter_1', guildId);
            expect(claimDup.alreadyClaimed).toBe(true);
            expect(claimDup.claimsCount).toBe(1);

            // Second user claiming the same item
            const claim2 = await service.claimItem(feed.id, item.id, 'user_hunter_2', guildId);
            expect(claim2.alreadyClaimed).toBe(false);
            expect(claim2.claimsCount).toBe(2);

            // Verify claims stored in repository
            const userClaims = await repo.getUserClaims('user_hunter_1', guildId);
            expect(userClaims.length).toBe(1);
            expect(userClaims[0].itemId).toBe(item.id);
        });

        it('accumulates items and formats periodic digest with AI overview', async () => {
            const digestService = new AutofeedsDigestService();
            const feed = {
                id: 'feed_digest_daily',
                guildId,
                name: 'Tech Daily Digest',
                digestMode: 'daily',
                digestSchedule: '09:00'
            };

            const items = [
                { id: 'art_1', title: 'Nouvelle IA Gemini 3.0', link: 'https://tech.com/1' },
                { id: 'art_2', title: 'Sortie de Node.js v24', link: 'https://tech.com/2' }
            ];

            digestService.accumulateItem(feed.id, items[0]);
            digestService.accumulateItem(feed.id, items[1]);
            expect(digestService.getPendingCount(feed.id)).toBe(2);

            // Generate digest embed
            const embed = await digestService.generateDigestEmbed(feed, items, 'Aperçu matinal des innovations technologiques');
            expect(embed.data.title).toContain('Gazette & Digest');
            expect(embed.data.description).toContain('Aperçu matinal des innovations technologiques');
            expect(embed.data.fields.length).toBe(2);

            // Clear accumulated items
            digestService.clearPending(feed.id);
            expect(digestService.getPendingCount(feed.id)).toBe(0);
        });

        it('provides fulltext search and guild stats analytics', async () => {
            const feed = await service.addFeed({
                guildId,
                channelId,
                name: 'Searchable Feed',
                feedUrl: 'https://search.com/rss',
                feedType: 'rss',
                category: 'gaming'
            });

            // Log history entries with enriched metadata
            await repo.logHistory({
                feedId: feed.data.id,
                itemId: 'hist_item_1',
                title: 'Grand Theft Auto VI Trailer Released',
                link: 'https://rockstar.com/gta6',
                contentSnippet: 'Vice City awaits in this high octane adventure',
                itemTags: ['#gta', '#gaming', '#rockstar'],
                itemCategory: 'gaming'
            });

            // Search by query
            const searchResults = await service.searchItems(guildId, { query: 'Grand Theft' });
            expect(searchResults.length).toBeGreaterThanOrEqual(1);
            expect(searchResults[0].title).toContain('Grand Theft Auto VI');

            // Search by tag
            const tagResults = await service.searchItems(guildId, { tag: 'rockstar' });
            expect(tagResults.length).toBeGreaterThanOrEqual(1);

            // Fetch guild stats
            const stats = await service.getGuildStats(guildId);
            expect(stats.totalFeeds).toBeGreaterThanOrEqual(1);
            expect(stats.activeFeeds).toBeGreaterThanOrEqual(1);
            expect(stats.totalPosts).toBeGreaterThanOrEqual(1);
            expect(stats.topProviders).toBeDefined();
            expect(stats.topProviders.some(p => p.provider === 'rss')).toBe(true);

            // API Controller stats endpoint
            let resJson = null;
            const mockRes = {
                json: (data) => { resJson = data; }
            };
            await controller.getStats({ params: { guildId } }, mockRes);
            expect(resJson.success).toBe(true);
            expect(resJson.data.totalFeeds).toBe(stats.totalFeeds);
        });
    });
});

