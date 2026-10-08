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
import { AutofeedsPulseService } from '../src/modules/util_autofeeds/services/autofeeds-pulse.service.js';
import { AutofeedsClusteringService } from '../src/modules/util_autofeeds/services/autofeeds-clustering.service.js';
import { AutofeedsPurgeService } from '../src/modules/util_autofeeds/services/autofeeds-purge.service.js';
import { AutofeedsAudioService } from '../src/modules/util_autofeeds/services/autofeeds-audio.service.js';
import { communityVotingService } from '../src/services/community-voting.service.js';
import { AutofeedsPricingService } from '../src/modules/util_autofeeds/services/autofeeds-pricing.service.js';
import { AutofeedsEventsService } from '../src/modules/util_autofeeds/services/autofeeds-events.service.js';
import { AutofeedsSecurityService } from '../src/modules/util_autofeeds/services/autofeeds-security.service.js';
import { AutofeedsSentimentService } from '../src/modules/util_autofeeds/services/autofeeds-sentiment.service.js';
import { AutofeedsReaderService } from '../src/modules/util_autofeeds/services/autofeeds-reader.service.js';

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
        await db.pool.query(`DELETE FROM autofeed_price_history`).catch(() => {});
        await db.pool.query(`DELETE FROM community_votes`).catch(() => {});
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
        it('registers all 20 providers in registry', () => {
            const list = providerRegistry.list();
            expect(list.length).toBe(20);
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
            expect(names).toContain('steam');
            expect(names).toContain('animesphere');
            expect(names).toContain('justwatch');
            expect(names).toContain('ai_models');
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

    // ---------------------------------------------------------------
    // 14. v4 Enhancements: Steam Direct, Pulse, Clustering, Breaking News, Purge & Audio
    // ---------------------------------------------------------------
    describe('14. v4 Enhancements: Steam Direct, Community Pulse, Clustering, Breaking News, Purge & Audio Briefing', () => {
        it('detects, extracts AppID, and resolves Steam news feeds with BBCode cleaning', () => {
            const steamProv = providerRegistry.get('steam');
            expect(steamProv).toBeDefined();

            // Detection
            expect(providerRegistry.detectProvider('https://store.steampowered.com/app/730/CounterStrike_2/')).toBe('steam');
            expect(providerRegistry.detectProvider('https://steamcommunity.com/app/252490')).toBe('steam');
            expect(providerRegistry.detectProvider('steam:730')).toBe('steam');
            expect(providerRegistry.detectProvider('730')).toBe('steam');

            // AppID Extraction
            expect(steamProv.extractAppId('https://store.steampowered.com/app/730/CounterStrike_2/')).toBe('730');
            expect(steamProv.extractAppId('https://steamcommunity.com/app/252490/announcements')).toBe('252490');
            expect(steamProv.extractAppId('steam:570')).toBe('570');
            expect(steamProv.extractAppId('1086940')).toBe('1086940');

            // URL Resolution
            const resolved = steamProv.resolveUrl('730');
            expect(resolved).toContain('appid=730');
            expect(resolved).toContain('ISteamNews/GetNewsForApp');

            // Tagging
            const tags = steamProv.tagItem({ title: 'Major Patch Update v1.2 Notes' });
            expect(tags).toContain('#steam');
            expect(tags).toContain('#gaming');
            expect(tags).toContain('#update');

            // BBCode cleaning
            const bbcodeText = '[b]New Feature[/b]: [url=https://store.steampowered.com]Steam Store[/url] [img]https://clan.akamai.steamstatic.com/images/123.jpg[/img] [list][*]Fix 1[*]Fix 2[/list]';
            const cleaned = steamProv.cleanBbcode(bbcodeText);
            expect(cleaned).toContain('**New Feature**');
            expect(cleaned).toContain('[Steam Store](https://store.steampowered.com)');
            expect(cleaned).toContain('• Fix 1');
            expect(cleaned).toContain('• Fix 2');
        });

        it('handles Community Pulse auto-reactions and opinion polls', async () => {
            const pulseService = new AutofeedsPulseService();

            const feed = {
                id: 'feed_pulse_1',
                autoReactions: ['🔥', '❤️', '💸'],
                autoPoll: true
            };

            const item = {
                id: 'item_poll_1',
                title: 'Cyberpunk 2077 Sequel Announced by CD Projekt Red'
            };

            // Build Poll Payload
            const pollPayload = pulseService.buildPollPayload(feed, item);
            expect(pollPayload).not.toBeNull();
            expect(pollPayload.question.text).toContain('Que pensez-vous');
            expect(pollPayload.answers.length).toBeGreaterThanOrEqual(3);
            expect(pollPayload.duration).toBe(24);

            // Reaction Application on Mock Discord Message
            const reactedEmojis = [];
            const mockMsg = {
                react: async (emoji) => {
                    reactedEmojis.push(emoji);
                }
            };

            await pulseService.applyReactions(mockMsg, feed.autoReactions);
            expect(reactedEmojis).toEqual(['🔥', '❤️', '💸']);
        });

        it('normalizes URLs, computes Jaccard title similarity, and detects duplicates across feeds', () => {
            const clustering = new AutofeedsClusteringService();

            // Canonical URL normalization (stripping tracking params & fragments)
            const dirtyUrl1 = 'https://www.ign.com/articles/elden-ring-dlc-guide?utm_source=twitter&utm_medium=social&utm_campaign=launch#comments';
            const dirtyUrl2 = 'https://www.ign.com/articles/elden-ring-dlc-guide?fbclid=IwAR12345&ref=homepage';
            expect(clustering.normalizeUrl(dirtyUrl1)).toBe('https://www.ign.com/articles/elden-ring-dlc-guide');
            expect(clustering.normalizeUrl(dirtyUrl2)).toBe('https://www.ign.com/articles/elden-ring-dlc-guide');

            // Exact canonical match
            expect(clustering.isExactDuplicate(dirtyUrl1, dirtyUrl2)).toBe(true);

            // Title Token Similarity
            const titleA = 'GTA 6 official trailer released by Rockstar Games';
            const titleB = 'Rockstar Games officially releases first GTA 6 trailer';
            const titleUnrelated = 'Best microwave ovens to buy in 2026';

            const simHigh = clustering.computeTitleSimilarity(titleA, titleB);
            const simLow = clustering.computeTitleSimilarity(titleA, titleUnrelated);

            expect(simHigh).toBeGreaterThan(0.4);
            expect(simLow).toBeLessThan(0.2);

            // Cluster Candidate Match
            const recentHistory = [
                {
                    id: 101,
                    feedId: 'feed_ign',
                    canonicalUrl: 'https://othernews.com/news',
                    title: 'Rockstar Games officially releases first GTA 6 trailer',
                    publishedAt: new Date()
                }
            ];

            const candidate = clustering.findClusterCandidate(
                { canonicalUrl: 'https://gamespot.com/gta6', title: titleA },
                recentHistory,
                0.4
            );

            expect(candidate).not.toBeNull();
            expect(candidate.id).toBe(101);
        });

        it('identifies Breaking News, bypasses quiet hours, and applies urgent red embed styling', () => {
            const breakingFeed = {
                id: 'feed_security_breaking',
                name: 'Security Advisories',
                breakingKeywords: ['BREAKING', 'URGENT', 'CVE-', '0-DAY'],
                bypassQuietHours: true,
                breakingRoleId: 'role_sec_alert',
                quietHours: {
                    enabled: true,
                    start: '22:00',
                    end: '08:00',
                    suppressMentions: true
                }
            };

            const regularItem = {
                title: 'Weekly security digest and minor patch notes',
                content: 'Everything is normal.'
            };

            const breakingItem = {
                title: 'URGENT: CVE-2026-9999 Critical Remote Code Execution Found',
                content: 'Patch immediately.'
            };

            // Detection
            expect(service.isBreakingItem(breakingFeed, regularItem)).toBe(false);
            expect(service.isBreakingItem(breakingFeed, breakingItem)).toBe(true);

            // Embed Styling
            const regularEmbed = service.buildDiscordEmbed(breakingFeed, regularItem, false);
            const breakingEmbed = service.buildDiscordEmbed(breakingFeed, breakingItem, true);

            expect(breakingEmbed.data.color).toBe(0xED4245); // Red Discord alert
            expect(breakingEmbed.data.title).toContain('🚨 FLASH INFO :');
            expect(breakingEmbed.data.title).toContain('CVE-2026-9999');
            expect(regularEmbed.data.color).not.toBe(0xED4245);
        });

        it('scans and purges expired deals and deletes Discord messages', async () => {
            const feedRes = await service.addFeed({
                guildId,
                channelId,
                name: 'Expiring Deals Feed',
                feedUrl: 'https://deals.example.com/rss',
                autoExpireDays: 3
            });
            const feedId = feedRes.data.id;

            // Log history entries: one recent, one expired (5 days ago)
            const now = new Date();
            const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000);

            // Active item
            await repo.logHistory({
                feedId,
                itemId: 'item_active',
                title: 'New Game On Sale',
                link: 'https://deals.example.com/1',
                channelId,
                messageId: 'msg_discord_active',
                publishedAt: now
            });

            // Expired item
            await repo.logHistory({
                feedId,
                itemId: 'item_expired',
                title: 'Expired Freebie Giveaway',
                link: 'https://deals.example.com/2',
                channelId,
                messageId: 'msg_discord_expired',
                publishedAt: fiveDaysAgo
            });

            // Mock Discord client to track message deletion
            const deletedMessageIds = [];
            const mockDiscordClient = {
                channels: {
                    fetch: async (cId) => ({
                        id: cId,
                        messages: {
                            fetch: async (mId) => {
                                if (mId === 'msg_discord_expired') {
                                    return {
                                        id: mId,
                                        delete: async () => {
                                            deletedMessageIds.push(mId);
                                        }
                                    };
                                }
                                throw new Error('Unknown message');
                            }
                        }
                    })
                }
            };

            // Run purge
            const purgeRes = await service.purgeExpired(feedId, mockDiscordClient);
            expect(purgeRes.expiredCount).toBe(1);
            expect(purgeRes.deletedMessagesCount).toBe(1);
            expect(deletedMessageIds).toContain('msg_discord_expired');

            // Controller purge endpoint
            let ctrlJson = null;
            const mockRes = { json: (d) => { ctrlJson = d; } };
            await controller.purge({ body: { feedId } }, mockRes);
            expect(ctrlJson.success).toBe(true);
        });

        it('generates TTS radio briefing script and MP3 audio buffer', async () => {
            const audioService = new AutofeedsAudioService();

            const items = [
                { title: 'Valve annonce le Steam Deck 2', contentSnippet: 'Plus puissant et écran OLED 120Hz.' },
                { title: 'Half-Life 3 confirmé pour 2027', contentSnippet: 'Gabe Newell prend enfin la parole.' }
            ];

            const script = audioService.buildBriefingScript('Steam Actualités', items);
            expect(script).toContain('bulletin d\'information');
            expect(script).toContain('Steam Actualités');
            expect(script).toContain('Valve annonce le Steam Deck 2');
            expect(script).toContain('Half-Life 3 confirmé pour 2027');

            // Generate MP3 buffer
            const buffer = await audioService.generateBriefingBuffer(script);
            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(10);
            // Check ID3v2 / MP3 header
            expect(buffer.slice(0, 3).toString('ascii')).toBe('ID3');

            // Test Service createAudioBriefing
            const feedRes = await service.addFeed({
                guildId,
                channelId,
                name: 'Audio Tech Digest',
                feedUrl: 'https://audio.example.com/rss',
                enableAudioBriefing: true
            });

            await repo.logHistory({
                feedId: feedRes.data.id,
                itemId: 'audio_item_1',
                title: 'ChienneBot intègre un flash radio TTS',
                contentSnippet: 'Une synthèse audio automatique révolutionnaire.',
                publishedAt: new Date()
            });

            const briefing = await service.createAudioBriefing(feedRes.data.id, 5);
            expect(briefing.feedTitle).toBe('Audio Tech Digest');
            expect(briefing.script).toContain('flash radio');
            expect(briefing.buffer).toBeInstanceOf(Buffer);
            expect(briefing.filename).toContain('.mp3');

            // Controller getAudioBriefing
            let ctrlAudio = null;
            const mockRes = { json: (d) => { ctrlAudio = d; } };
            await controller.getAudioBriefing({ params: { id: feedRes.data.id } }, mockRes);
            expect(ctrlAudio.success).toBe(true);
            expect(ctrlAudio.data.feedTitle).toBe('Audio Tech Digest');
            expect(ctrlAudio.data.sizeBytes).toBeGreaterThan(0);
        });
    });

    // ---------------------------------------------------------------
    // 15. v5 Enhancements: Modular Community Voting, Deal Price Tracker, Event Sync, Security Shield, Sentiment Filter & Reader View
    // ---------------------------------------------------------------
    describe('15. v5 Enhancements: Community Voting, Price & ATL, Events, Security, Sentiment, Reader', () => {
        it('handles universal community voting with toggles, stats, action rows and threshold hooks', async () => {
            const targetType = 'suggestion';
            const targetId = 'sugg_test_999';

            // Initial stats
            let stats = await communityVotingService.getStats(targetType, targetId);
            expect(stats.upvotes).toBe(0);
            expect(stats.downvotes).toBe(0);
            expect(stats.score).toBe(0);

            // User 1 upvotes
            let v1 = await communityVotingService.vote({ targetType, targetId, userId: 'user_1', voteType: 'up' });
            expect(v1.userVote).toBe('up');
            expect(v1.stats.upvotes).toBe(1);
            expect(v1.stats.score).toBe(1);

            // User 1 switches to downvote
            let v2 = await communityVotingService.vote({ targetType, targetId, userId: 'user_1', voteType: 'down' });
            expect(v2.userVote).toBe('down');
            expect(v2.stats.upvotes).toBe(0);
            expect(v2.stats.downvotes).toBe(1);
            expect(v2.stats.score).toBe(-1);

            // User 1 clicks downvote again (toggle removal)
            let v3 = await communityVotingService.vote({ targetType, targetId, userId: 'user_1', voteType: 'down' });
            expect(v3.userVote).toBeNull();
            expect(v3.stats.downvotes).toBe(0);
            expect(v3.stats.score).toBe(0);

            // Multiple users voting
            await communityVotingService.vote({ targetType, targetId, userId: 'user_1', voteType: 'up' });
            await communityVotingService.vote({ targetType, targetId, userId: 'user_2', voteType: 'up' });
            await communityVotingService.vote({ targetType, targetId, userId: 'user_3', voteType: 'down' });

            stats = await communityVotingService.getStats(targetType, targetId);
            expect(stats.upvotes).toBe(2);
            expect(stats.downvotes).toBe(1);
            expect(stats.score).toBe(1);
            expect(stats.totalVotes).toBe(3);

            // Button action row generation
            const row = communityVotingService.buildVoteRow({
                targetType,
                targetId,
                upCount: stats.upvotes,
                downCount: stats.downvotes,
                userVote: 'up'
            });
            expect(row.components.length).toBe(2);
            expect(row.components[0].data.custom_id).toBe(`vote:${targetType}:${targetId}:up`);
            expect(row.components[1].data.custom_id).toBe(`vote:${targetType}:${targetId}:down`);
            expect(row.components[0].data.label).toContain('2');
            expect(row.components[1].data.label).toContain('1');

            // Threshold hook trigger
            let triggeredPayload = null;
            communityVotingService.registerThresholdHook(targetType, async (payload) => {
                triggeredPayload = payload;
            });

            // Vote until reaching threshold of 3
            await communityVotingService.vote({ targetType, targetId, userId: 'user_3', voteType: 'up' }); // switches user_3 to up -> score: 3
            expect(triggeredPayload).not.toBeNull();
            expect(triggeredPayload.targetId).toBe(targetId);
            expect(triggeredPayload.stats.score).toBe(3);

            // Test interaction handler
            let updatedPayload = null;
            const mockInteraction = {
                customId: `vote:${targetType}:${targetId}:up`,
                user: { id: 'user_4' },
                isButton: () => true,
                update: async (p) => { updatedPayload = p; },
                message: { components: [row] }
            };
            const handled = await communityVotingService.handleInteraction(mockInteraction);
            expect(handled).toBe(true);
            expect(updatedPayload).not.toBeNull();
            expect(updatedPayload.components.length).toBe(1);
        });

        it('promotes autofeed articles to best-of channel upon reaching vote threshold', async () => {
            const feedRes = await service.addFeed({
                guildId,
                channelId,
                name: 'Gaming Best-Of Feed',
                feedUrl: 'https://gaming.example.com/rss',
                enableVoting: true,
                bestOfThreshold: 2,
                bestOfChannelId: 'chan_best_of_hall_of_fame'
            });
            const feed = feedRes.data;

            // Log item in history
            const itemUrl = 'https://gaming.example.com/goty-announcement';
            await repo.recordPostedItem({
                feedId: feed.id,
                itemGuid: 'goty_2026',
                itemUrl,
                itemTitle: 'Clair Obscur Expedition 33 élu GOTY',
                discordMessageId: 'msg_embed_goty_123',
                channelId: feed.channelId
            });

            // Set up mock client with destination bestOf channel
            let bestOfSentEmbed = null;
            const mockBestOfChannel = {
                send: async (payload) => {
                    bestOfSentEmbed = payload;
                    return { id: 'best_of_msg_999' };
                }
            };
            service.discordClient = {
                channels: {
                    cache: new Map([['chan_best_of_hall_of_fame', mockBestOfChannel]]),
                    fetch: async (cId) => (cId === 'chan_best_of_hall_of_fame' ? mockBestOfChannel : null)
                }
            };

            const targetId = `${feed.id}:${itemUrl}`;
            await communityVotingService.vote({ targetType: 'autofeed', targetId, userId: 'voter_1', voteType: 'up' });
            await communityVotingService.vote({ targetType: 'autofeed', targetId, userId: 'voter_2', voteType: 'up' });

            // Trigger threshold handler
            await service.handleVoteThresholdReached({
                targetType: 'autofeed',
                targetId,
                score: 2,
                stats: { upvotes: 2, downvotes: 0, score: 2 }
            });

            expect(bestOfSentEmbed).not.toBeNull();
            expect(bestOfSentEmbed.embeds[0].data.title).toContain('🏆 [BEST-OF]');
            expect(bestOfSentEmbed.embeds[0].data.title).toContain('Expedition 33');

            // History record should have is_best_of = true
            const res = await db.pool.query('SELECT is_best_of FROM autofeed_history WHERE feed_id = $1 AND item_url = $2', [feed.id, itemUrl]);
            expect(Boolean(res.rows[0]?.is_best_of)).toBe(true);
        });

        it('tracks deal prices, detects All-Time Lows (ATL) and enforces min discount percent', async () => {
            const pricingService = new AutofeedsPricingService(repo);

            // 1. Extraction from text
            const textDeal = 'Promo Steam : Cyberpunk 2077 Ultimate Edition est à 14,99 € au lieu de 59,99 € (-75%) sur Steam !';
            const priceInfo = pricingService.extractPriceAndDiscount(textDeal);
            expect(priceInfo).not.toBeNull();
            expect(priceInfo.currentPrice).toBe(14.99);
            expect(priceInfo.originalPrice).toBe(59.99);
            expect(priceInfo.discountPercent).toBe(75);
            expect(priceInfo.currency).toBe('€');

            // 2. Minimum discount filter
            expect(pricingService.meetsMinDiscount(priceInfo, 50)).toBe(true);
            expect(pricingService.meetsMinDiscount(priceInfo, 80)).toBe(false);

            // 3. Price history and ATL detection
            const itemUrl = 'https://store.steampowered.com/app/1091500/Cyberpunk_2077/';
            const feedId = 'feed_deal_tracker_1';

            // First price record (19.99 €)
            const atlFirst = await pricingService.analyzeAndRecordPrice({
                feedId,
                itemUrl,
                title: 'Cyberpunk 2077',
                priceInfo: { currentPrice: 19.99, originalPrice: 59.99, discountPercent: 66, currency: '€' }
            });
            expect(atlFirst.isAllTimeLow).toBe(true);
            expect(atlFirst.previousLowest).toBeNull();

            // Second price record (higher: 29.99 €)
            const atlSecond = await pricingService.analyzeAndRecordPrice({
                feedId,
                itemUrl,
                title: 'Cyberpunk 2077',
                priceInfo: { currentPrice: 29.99, originalPrice: 59.99, discountPercent: 50, currency: '€' }
            });
            expect(atlSecond.isAllTimeLow).toBe(false);
            expect(atlSecond.previousLowest).toBe(19.99);

            // Third price record (new lowest: 14.99 €)
            const atlThird = await pricingService.analyzeAndRecordPrice({
                feedId,
                itemUrl,
                title: 'Cyberpunk 2077',
                priceInfo: { currentPrice: 14.99, originalPrice: 59.99, discountPercent: 75, currency: '€' }
            });
            expect(atlThird.isAllTimeLow).toBe(true);
            expect(atlThird.previousLowest).toBe(19.99);

            // Badge text formatting
            const badge = pricingService.formatDiscountBadge({
                ...priceInfo,
                isAllTimeLow: true,
                previousLowest: 19.99
            });
            expect(badge).toContain('-75%');
            expect(badge).toContain('14.99 €');
            expect(badge).toContain('PLUS BAS PRIX HISTORIQUE');
        });

        it('detects future dates and synchronizes Discord GuildScheduledEvents', async () => {
            const eventsService = new AutofeedsEventsService();

            const textISO = 'Rejoignez-nous pour le stream le 2026-11-20T20:00:00Z en direct !';
            const dateISO = eventsService.extractFutureEventDate(textISO);
            expect(dateISO).not.toBeNull();
            expect(dateISO.getUTCFullYear()).toBe(2026);
            expect(dateISO.getUTCMonth()).toBe(10); // Nov (0-indexed)

            const textFR = 'Grande finale du tournoi le 25 décembre 2026 à 21h30';
            const dateFR = eventsService.extractFutureEventDate(textFR);
            expect(dateFR).not.toBeNull();
            expect(dateFR.getUTCDate()).toBe(25);
            expect(dateFR.getUTCFullYear()).toBe(2026);

            // Sync with mock Discord guild
            let createdEventPayload = null;
            const mockGuild = {
                id: 'guild_loot_test_777',
                scheduledEvents: {
                    fetch: async () => [],
                    create: async (payload) => {
                        createdEventPayload = payload;
                        return { id: 'discord_event_555', ...payload };
                    }
                }
            };
            const mockClient = {
                guilds: {
                    cache: new Map([[mockGuild.id, mockGuild]]),
                    fetch: async () => mockGuild
                }
            };

            const created = await eventsService.syncScheduledEvent({
                client: mockClient,
                guildId: mockGuild.id,
                title: 'Tournoi Smash Ultimate',
                description: 'La grande finale aura lieu avec tous les champions !',
                url: 'https://smash.example.com/tournament',
                scheduledDate: dateFR
            });

            expect(created).not.toBeNull();
            expect(createdEventPayload.name).toBe('Tournoi Smash Ultimate');
            expect(createdEventPayload.scheduledStartTime).toEqual(dateFR);
            expect(createdEventPayload.entityMetadata.location).toBe('https://smash.example.com/tournament');
        });

        it('unshortens URLs and shields channels against suspicious links and phishing', async () => {
            const securityService = new AutofeedsSecurityService();

            // Link shortener recognition
            expect(securityService.isShortenedUrl('https://bit.ly/cyberdeal33')).toBe(true);
            expect(securityService.isShortenedUrl('https://t.co/xyz123')).toBe(true);
            expect(securityService.isShortenedUrl('https://store.steampowered.com/app/10')).toBe(false);

            // Phishing / dangerous extensions analysis
            const cleanUrl = 'https://store.epicgames.com/fr/p/death-stranding';
            const phishingUrl = 'http://discord-nitro-gift-free.xyz/claim.exe';
            const dangerousExtUrl = 'https://files.freegames.net/setup_patch.scr';

            expect(securityService.isSafeUrl(cleanUrl).safe).toBe(true);

            const checkPhish = securityService.isSafeUrl(phishingUrl);
            expect(checkPhish.safe).toBe(false);
            expect(checkPhish.reason).toContain('exécutable') || expect(checkPhish.reason).toContain('suspect');

            const checkExt = securityService.isSafeUrl(dangerousExtUrl);
            expect(checkExt.safe).toBe(false);
            expect(checkExt.reason).toContain('.scr');
        });

        it('analyzes text polarity and filters negative news in Good Vibes Only mode', () => {
            const sentimentService = new AutofeedsSentimentService();

            const positiveNews = 'Une incroyable découverte scientifique apporte une merveilleuse victoire et un immense succès pour tous !';
            const negativeNews = 'Un drame effroyable et une crise catastrophique provoquent un deuil terrible et un choc immense.';
            const neutralNews = 'La réunion hebdomadaire du conseil municipal a eu lieu mardi après-midi à la mairie.';

            const posScore = sentimentService.calculateSentiment(positiveNews);
            const negScore = sentimentService.calculateSentiment(negativeNews);
            const neuScore = sentimentService.calculateSentiment(neutralNews);

            expect(posScore).toBeGreaterThan(0.2);
            expect(negScore).toBeLessThan(-0.2);
            expect(Math.abs(neuScore)).toBeLessThan(0.2);

            // Good vibes filter test
            expect(sentimentService.shouldFilterItem(negativeNews, true)).toBe(true);
            expect(sentimentService.shouldFilterItem(positiveNews, true)).toBe(false);
            expect(sentimentService.shouldFilterItem(negativeNews, false)).toBe(false);
        });

        it('extracts clean reader article content and provides controller endpoints', async () => {
            const readerService = new AutofeedsReaderService();

            const mockHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Test Article Title - Le Journal</title>
                    <meta property="og:site_name" content="Le Journal" />
                    <meta property="og:image" content="https://example.com/cover.jpg" />
                </head>
                <body>
                    <header><nav>Menu links here</nav></header>
                    <aside class="ads">Publicité invasive</aside>
                    <article>
                        <h1>Test Article Title</h1>
                        <p>Premier paragraphe d'actualité détaillant les informations essentielles de la journée dans le monde de la tech.</p>
                        <p>Second paragraphe apportant des précisions techniques et des analyses approfondies sur les performances.</p>
                        <div class="newsletter-signup">Inscrivez-vous !</div>
                    </article>
                    <footer>Copyright 2026</footer>
                </body>
                </html>
            `;

            const article = readerService.parseHtmlArticle(mockHtml, 'https://journal.example.com/tech-news');
            expect(article.title).toContain('Test Article Title');
            expect(article.siteName).toBe('Le Journal');
            expect(article.leadImageUrl).toBe('https://example.com/cover.jpg');
            expect(article.textContent).toContain('Premier paragraphe');
            expect(article.textContent).toContain('Second paragraphe');
            expect(article.textContent).not.toContain('Publicité');
            expect(article.readingTimeMinutes).toBeGreaterThanOrEqual(1);
            expect(article.wordCount).toBeGreaterThan(15);

            // Controller endpoints tests: /reader & /votes
            // Mock getReaderArticle on service
            service.getReaderArticle = async (url) => article;

            let readerResJson = null;
            const mockRes1 = { json: (d) => { readerResJson = d; } };
            await controller.getReaderArticle({ query: { url: 'https://journal.example.com/tech-news' } }, mockRes1);
            expect(readerResJson.success).toBe(true);
            expect(readerResJson.data.title).toContain('Test Article Title');

            let votesResJson = null;
            const mockRes2 = { json: (d) => { votesResJson = d; } };
            await controller.getVotes({ query: { targetType: 'autofeed', targetId: 'feed_1:item_1' } }, mockRes2);
            expect(votesResJson.success).toBe(true);
            expect(votesResJson.data).toHaveProperty('upvotes');
            expect(votesResJson.data).toHaveProperty('downvotes');
        });

        describe('16. v6 Enhancements: Story Clustering, Morning Digest, Translation, Q&A, Anti-Clickbait, Moderation & YouTube Summary', () => {
            const { AutofeedsClusteringService } = require('../src/modules/util_autofeeds/services/autofeeds-clustering.service.js');
            const { AutofeedsQaService } = require('../src/modules/util_autofeeds/services/autofeeds-qa.service.js');
            const { AutofeedsYouTubeSummaryService } = require('../src/modules/util_autofeeds/services/autofeeds-youtube-summary.service.js');
            const { AutofeedsUserDigestService } = require('../src/modules/util_autofeeds/services/autofeeds-user-digest.service.js');
            const { AutofeedInteractionListener } = require('../src/modules/util_autofeeds/events/autofeed-interaction.listener.js');

            it('clusters cross-source stories and merges related sources into existing history entries', async () => {
                const clusteringService = new AutofeedsClusteringService();

                const originalStory = {
                    id: 201,
                    title: 'Nvidia annonce sa nouvelle carte graphique RTX 5090 au CES',
                    url: 'https://techradar.com/rtx5090',
                    canonicalUrl: 'https://techradar.com/rtx5090'
                };

                const secondarySource = {
                    title: 'Nvidia annonce la carte graphique RTX 5090 au CES',
                    link: 'https://lesnumeriques.com/gpu-rtx-5090',
                    publishedAt: new Date().toISOString()
                };

                const match = clusteringService.findClusterCandidate(secondarySource, [originalStory], 0.50);
                expect(match).not.toBeNull();
                expect(match.candidate.id).toBe(201);

                // Test repo addRelatedSourceToHistory
                const relatedEntry = clusteringService.createRelatedSourceEntry({ id: 'feed_ln', name: 'Les Numériques' }, secondarySource);
                expect(relatedEntry.feedName).toBe('Les Numériques');
                expect(relatedEntry.title).toContain('RTX 5090');

                // Embed with related sources
                const feed = {
                    id: 'feed_tech',
                    name: 'TechRadar',
                    feedType: 'rss',
                    category: 'tech'
                };
                const itemWithRelated = {
                    title: originalStory.title,
                    link: originalStory.url,
                    extra: {
                        relatedSources: [relatedEntry]
                    }
                };
                const embed = service.buildDiscordEmbed(feed, itemWithRelated);
                const relatedField = embed.data.fields.find(f => f.name.includes('Sources liées'));
                expect(relatedField).toBeDefined();
                expect(relatedField.value).toContain('Les Numériques');
            });

            it('manages personal morning briefings (Mon Journal Privé) and processes due user digests', async () => {
                const userDigestService = new AutofeedsUserDigestService(repo);

                const schedule = await userDigestService.setUserSchedule('guild_v6', 'user_777', '08:30', true);
                expect(schedule.userId).toBe('user_777');
                expect(schedule.scheduleTime).toBe('08:30');
                expect(schedule.isEnabled).toBe(true);

                const fetched = await userDigestService.getUserSchedule('guild_v6', 'user_777');
                expect(fetched.scheduleTime).toBe('08:30');

                // Simulation due digests
                const dueList = await repo.listDueUserDigests('08:30');
                expect(dueList.length).toBeGreaterThanOrEqual(1);

                // Mock user subscription & posted items for digest
                await subService.subscribe({
                    guildId: 'guild_v6',
                    userId: 'user_777',
                    targetType: 'tag',
                    targetValue: 'tech'
                });

                await repo.recordPostedItem('feed_tech', 'item_digest_1', 'https://example.com/digest1', 'Nouveau processeur ultra rapide', {
                    guildId: 'guild_v6',
                    tags: ['tech']
                });

                let sentDm = null;
                const mockClient = {
                    users: {
                        fetch: async (uid) => {
                            if (uid === 'user_777') {
                                return {
                                    id: uid,
                                    send: async (payload) => { sentDm = payload; return payload; }
                                };
                            }
                            return null;
                        }
                    },
                    guilds: {
                        cache: new Map([['guild_v6', { name: 'Super Guilde' }]])
                    }
                };

                const sentCount = await userDigestService.processDueDigests(mockClient, '08:30');
                expect(sentCount).toBe(1);
                expect(sentDm).not.toBeNull();
                expect(sentDm.embeds[0].data.title).toContain('Ton Journal Privé');
                expect(sentDm.embeds[0].data.fields[0].name).toContain('Nouveau processeur');

                // Command /feed my-digest execution
                const cmd = new AutofeedCommands(service, subService);
                let commandReply = null;
                const mockInteraction = {
                    guild: { id: 'guild_v6' },
                    user: { id: 'user_777' },
                    options: {
                        getString: (opt) => opt === 'heure' ? '09:00' : null,
                        getBoolean: (opt) => opt === 'actif' ? true : null
                    },
                    reply: async (p) => { commandReply = p; }
                };

                await cmd.executeMyDigest(mockInteraction);
                expect(commandReply.content).toContain('Mon Journal Privé configuré');
                expect(commandReply.content).toContain('09:00');
            });

            it('translates foreign headlines into French when translateTitleToFr is enabled and provides ephemeral translation', async () => {
                let callAiMock = async (prompt) => {
                    if (prompt.includes('Traduis fidèlement ce titre')) {
                        return 'Mise à jour majeure 2.0 disponible aujourd’hui';
                    }
                    if (prompt.includes('Traduire en français fidèlement')) {
                        return JSON.stringify({
                            title: 'Mise à jour majeure 2.0 disponible aujourd’hui',
                            description: 'Nouveau contenu et correctifs majeurs de bugs.'
                        });
                    }
                    return 'Traduction test';
                };

                const customAiService = new (require('../src/modules/util_autofeeds/services/autofeeds-ai.service.js').AutofeedsAiService)(callAiMock);
                const translatedTitle = await customAiService.translateTitle('Major Update 2.0 Released Today');
                expect(translatedTitle).toContain('Mise à jour majeure 2.0');

                // Test interactive listener feed_trans
                const mockTransInteraction = {
                    customId: 'feed_trans:999',
                    isButton: () => true,
                    deferReply: async () => {},
                    editReply: async (payload) => payload,
                    message: {
                        embeds: [{
                            title: 'Major Update 2.0 Released Today',
                            description: 'Lots of new exciting features released today.'
                        }]
                    }
                };

                const listener = new AutofeedInteractionListener(subService, service);
                service.aiService = customAiService;

                let transReply = null;
                mockTransInteraction.editReply = async (p) => { transReply = p; };
                await listener.handle(mockTransInteraction);
                expect(transReply.content).toContain('Traduction en Français');
                expect(transReply.content).toContain('Mise à jour majeure 2.0');
            });

            it('neutralizes sensationalist headlines with Anti-Clickbait AI Titling and badge', async () => {
                let callAiMock = async (prompt) => {
                    if (prompt.includes('clickbait')) {
                        return JSON.stringify({
                            isClickbait: true,
                            sanitizedTitle: 'Patch 14.5 : Changements détaillés sur les héros et cartes'
                        });
                    }
                    return '{}';
                };

                const customAiService = new (require('../src/modules/util_autofeeds/services/autofeeds-ai.service.js').AutofeedsAiService)(callAiMock);
                const clickbaitItem = {
                    title: 'VOUS NE DEVINEZ JAMAIS CE QUI VA CHANGER DANS LE JEU !!!',
                    description: 'Le patch 14.5 arrive avec des buffs et nerfs sur les héros.'
                };

                const result = await customAiService.sanitizeClickbaitTitle(clickbaitItem);
                expect(result.isClickbait).toBe(true);
                expect(result.sanitizedTitle).toContain('Patch 14.5');

                // Embed testing with clickbait badge
                const feed = {
                    id: 'feed_news',
                    name: 'Gaming News',
                    feedType: 'rss',
                    category: 'gaming',
                    antiClickbait: true
                };
                const item = {
                    title: `🔍 ${result.sanitizedTitle}`,
                    link: 'https://example.com/patch',
                    extra: {
                        clickbaitClarification: clickbaitItem.title
                    }
                };

                const embed = service.buildDiscordEmbed(feed, item);
                expect(embed.data.title).toContain('🔍 Patch 14.5');
                const clarifField = embed.data.fields.find(f => f.name.includes('Anti-clickbait'));
                expect(clarifField).toBeDefined();
                expect(clarifField.value).toContain('VOUS NE DEVINEZ JAMAIS');
            });

            it('answers questions precisely with dedicated Article Q&A assistant and Modal interaction', async () => {
                const qaService = new AutofeedsQaService(
                    async (prompt) => 'La mise à jour sera déployée le 15 octobre 2026 à 14h00 UTC.',
                    { extractCleanArticle: async () => ({ title: 'Article Test', textContent: 'La mise à jour sera déployée le 15 octobre 2026 à 14h00 UTC.', wordCount: 150 }) }
                );

                const answerRes = await qaService.answerQuestion({
                    url: 'https://example.com/patch-notes',
                    question: 'À quelle date sort la mise à jour ?'
                });

                expect(answerRes.answer).toContain('15 octobre 2026');
                expect(answerRes.title).toBe('Article Test');

                // Test command /feed ask
                service.qaService = qaService;
                const cmd = new AutofeedCommands(service, subService);
                let askReply = null;
                const mockAskInteraction = {
                    deferReply: async () => {},
                    editReply: async (p) => { askReply = p; },
                    options: {
                        getString: (opt) => opt === 'url' ? 'https://example.com/patch-notes' : 'À quelle date sort la mise à jour ?'
                    }
                };

                await cmd.executeAsk(mockAskInteraction);
                expect(askReply.content).toContain('15 octobre 2026');
                expect(askReply.content).toContain('Réponse de l\'Assistant IA');
            });

            it('routes unapproved news to moderation waiting room and supports approval/rejection workflows', async () => {
                const modFeed = await repo.addFeed({
                    guildId: 'guild_mod',
                    channelId: 'public_channel_1',
                    feedUrl: 'https://untrusted.com/rss',
                    name: 'Communauté Blog',
                    requireApproval: true,
                    moderationChannelId: 'mod_channel_99'
                });

                expect(modFeed.requireApproval).toBe(true);
                expect(modFeed.moderationChannelId).toBe('mod_channel_99');

                // Record a pending item
                const histId = await repo.recordPostedItem(modFeed.id, 'item_unapproved_1', 'https://untrusted.com/article-1', 'Article soumis pour revue', {
                    guildId: 'guild_mod',
                    channelId: 'public_channel_1',
                    isPendingApproval: true
                });

                const histItem = await repo.getHistoryItemById(histId);
                expect(histItem.isPendingApproval).toBe(true);

                // List pending
                const pending = await repo.getPendingApprovals('guild_mod');
                expect(pending.length).toBeGreaterThanOrEqual(1);

                // Approve flow
                let publicSentMsg = null;
                const mockClient = {
                    channels: {
                        fetch: async (id) => ({
                            id,
                            send: async (p) => { publicSentMsg = p; return { id: 'msg_published_1' }; }
                        }),
                        cache: new Map([
                            ['public_channel_1', {
                                id: 'public_channel_1',
                                send: async (p) => { publicSentMsg = p; return { id: 'msg_published_1' }; }
                            }]
                        ])
                    }
                };

                const approveResult = await service.approvePendingNews(histId, 'admin_42', mockClient);
                expect(approveResult.ok).toBe(true);
                expect(approveResult.messageId).toBe('msg_published_1');
                expect(publicSentMsg.embeds[0].data.title).toContain('Article soumis pour revue');

                const refreshed = await repo.getHistoryItemById(histId);
                expect(refreshed.isPendingApproval).toBe(false);
                expect(refreshed.approvedBy).toBe('admin_42');

                // Reject flow on second item
                const histItem2Id = await repo.recordPostedItem(modFeed.id, 'item_unapproved_2', 'https://untrusted.com/article-2', 'Article spammé', {
                    guildId: 'guild_mod',
                    channelId: 'public_channel_1',
                    isPendingApproval: true
                });

                await service.rejectPendingNews(histItem2Id, 'admin_99');
                const rejected = await repo.getHistoryItemById(histItem2Id);
                expect(rejected.isPendingApproval).toBe(false);
                expect(rejected.rejectedBy).toBe('admin_99');
            });

            it('summarizes YouTube videos from subtitles/description with bullet points and action button', async () => {
                const ytService = new AutofeedsYouTubeSummaryService(async () => `Cette vidéo détaille le nouveau gameplay du jeu.
📌 Nouveau moteur graphique Unreal Engine 5.4.
📌 Temps de chargement réduits à zéro.
📌 Système de combat dynamique repensé.`);

                const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
                const videoId = ytService.extractVideoId(videoUrl);
                expect(videoId).toBe('dQw4w9WgXcQ');

                const shortUrl = 'https://youtu.be/abcdefghijk';
                expect(ytService.extractVideoId(shortUrl)).toBe('abcdefghijk');

                const summary = await ytService.summarizeVideo({
                    url: videoUrl,
                    title: 'Gameplay Reveal Trailer',
                    description: 'Full trailer description'
                });

                expect(summary.videoId).toBe('dQw4w9WgXcQ');
                expect(summary.summary).toContain('📌 Nouveau moteur graphique');

                // Check action rows have YouTube summary button
                const ytFeed = {
                    id: 'feed_yt',
                    feedType: 'youtube',
                    enableVideoSummary: true
                };
                const rows = service.buildComponentRows(ytFeed, { link: videoUrl, id: 'v123' }, 501);
                const aiRow = rows.find(r => r.components.some(c => c.data.custom_id?.includes('feed_vsum')));
                expect(aiRow).toBeDefined();
            });

            it('exposes all v6 endpoints through the AutofeedsController', async () => {
                // Mock user digest in service
                service.getUserDigestSchedule = async (g, u) => ({ userId: u, scheduleTime: '08:00', isEnabled: true });
                service.setUserDigestSchedule = async (g, u, t, e) => ({ userId: u, scheduleTime: t, isEnabled: e });
                service.answerArticleQuestion = async ({ question }) => ({ answer: `Réponse à: ${question}` });
                service.summarizeYouTubeVideo = async () => ({ summary: 'Points clés vidéo' });

                // 1. GET & POST /user-digest
                let jsonRes = null;
                const mockRes = { json: (d) => { jsonRes = d; } };

                await controller.getUserDigest({ query: { user_id: 'u1' } }, mockRes);
                expect(jsonRes.success).toBe(true);
                expect(jsonRes.data.scheduleTime).toBe('08:00');

                await controller.setUserDigest({ body: { user_id: 'u1', schedule_time: '07:30', is_enabled: true } }, mockRes);
                expect(jsonRes.success).toBe(true);
                expect(jsonRes.data.scheduleTime).toBe('07:30');

                // 2. POST /qa
                await controller.answerQuestion({ body: { url: 'https://ex.com', question: 'Quelle est la date ?' } }, mockRes);
                expect(jsonRes.success).toBe(true);
                expect(jsonRes.data.answer).toContain('Quelle est la date ?');

                // 3. POST /video-summary
                await controller.summarizeVideo({ body: { url: 'https://youtube.com/watch?v=12345678901' } }, mockRes);
                expect(jsonRes.success).toBe(true);
                expect(jsonRes.data.summary).toContain('Points clés');

                // 4. Moderation endpoints
                await controller.listPendingModeration({ query: { guild_id: 'guild_mod' } }, mockRes);
                expect(jsonRes.success).toBe(true);
                expect(Array.isArray(jsonRes.data)).toBe(true);
            });
        });

        // =========================================================================
        // SECTION 17 : LOT V7 FINAL (Rappels Sortie, Fact-Check & Enquête, Smart Tagging, Knowledge Sync, Trivia & Prédictions XP)
        // =========================================================================
        describe('Section 17 : Lot v7 Final (Rappels, Fact-Check, Smart Tags, Wiki, Trivia & Predictions)', () => {
            const { AutofeedsReminderService } = require('../src/modules/util_autofeeds/services/autofeeds-reminder.service.js');
            const { AutofeedsInvestigationService } = require('../src/modules/util_autofeeds/services/autofeeds-investigation.service.js');
            const { AutofeedsSmartTagService } = require('../src/modules/util_autofeeds/services/autofeeds-smart-tag.service.js');
            const { AutofeedsKnowledgeService } = require('../src/modules/util_autofeeds/services/autofeeds-knowledge.service.js');
            const { AutofeedsTriviaService } = require('../src/modules/util_autofeeds/services/autofeeds-trivia.service.js');
            const { AutofeedsPredictionService } = require('../src/modules/util_autofeeds/services/autofeeds-prediction.service.js');

            it('detects release dates with various formats in AutofeedsReminderService', () => {
                const reminderService = new AutofeedsReminderService(repo);

                expect(reminderService.detectReleaseDate('Grand Theft Auto VI sortira le 2026-11-15 sur consoles')).toBe('2026-11-15');
                expect(reminderService.detectReleaseDate('Disponible en magasin dès le 25/10/2026')).toBe('2026-10-25');
                expect(reminderService.detectReleaseDate('Sortie confirmée le 15 novembre 2026')).toBe('2026-11-15');
                expect(reminderService.detectReleaseDate('Sortie prévue pour 30 mai 2026')).toBe('2026-05-30');
                expect(reminderService.detectReleaseDate('Aucune date annoncée pour l\'instant')).toBeNull();
            });

            it('creates release reminders and processes due notifications via DM', async () => {
                const reminderService = new AutofeedsReminderService(repo);
                const guildId = 'guild_v7_remind';
                const userId = 'user_remind_99';

                // Enregistrement d'un rappel
                const reminder = await reminderService.addReminder({
                    guildId,
                    userId,
                    releaseDate: '2026-10-08',
                    itemTitle: 'Metroid Prime 4: Beyond',
                    itemUrl: 'https://nintendo.com/metroid-prime-4'
                });

                expect(reminder).toBeDefined();
                expect(reminder.id).toBeDefined();
                expect(reminder.releaseDate).toBe('2026-10-08');

                // Récupération des rappels utilisateur
                const userList = await reminderService.getUserReminders(userId, guildId);
                expect(userList.length).toBeGreaterThanOrEqual(1);

                // Simulation client Discord pour notification DM
                let dmSent = false;
                let sentContent = '';
                const mockClient = {
                    users: {
                        fetch: async (id) => {
                            if (id === userId) {
                                return {
                                    send: async (payload) => {
                                        dmSent = true;
                                        sentContent = payload.content;
                                        return payload;
                                    }
                                };
                            }
                            return null;
                        }
                    }
                };

                const processRes = await reminderService.processDueReminders(mockClient);
                expect(processRes.processed).toBeGreaterThanOrEqual(1);
                expect(processRes.sent).toBeGreaterThanOrEqual(1);
                expect(dmSent).toBe(true);
                expect(sentContent).toContain('Rappel Personnel');
            });

            it('performs fact-check analysis and stores reliability score in AutofeedsInvestigationService', async () => {
                const mockAi = async () => JSON.stringify({
                    pros: ['Sources officielles du studio citées', 'Gameplay vérifiable'],
                    cons: ['Date sujette à d\'éventuels reports'],
                    score: 88,
                    verdict: 'Très Fiable',
                    explanation: 'Information confirmée par le développeur.'
                });

                const investService = new AutofeedsInvestigationService(repo, mockAi);
                const res = await investService.analyzeArticleBalanceAndReliability({
                    title: 'The Witcher 4 entre en pleine production',
                    content: 'CD Projekt confirme officiellement le démarrage de la pleine production.'
                });

                expect(res.score).toBe(88);
                expect(res.verdict).toBe('Très Fiable');
                expect(res.pros.length).toBe(2);
                expect(res.cons.length).toBe(1);

                const embed = investService.buildFactCheckEmbed(res);
                expect(embed.data.title).toContain('Fact-Check & Analyse');
                expect(embed.data.fields.length).toBe(2);

                const btn = investService.createFactCheckButton(12345);
                expect(btn.data.custom_id).toBe('feed_factcheck:12345');
            });

            it('conducts meta-investigation across history with timeline and consensus', async () => {
                const investService = new AutofeedsInvestigationService(repo);
                const guildId = 'guild_v7_invest';

                // Préparer un historique de plusieurs articles sur le même sujet
                const feed = await repo.addFeed({
                    guildId,
                    channelId: 'chan_inv',
                    feedUrl: 'https://ex.com/invest.xml',
                    name: 'JeuxActu'
                });

                await repo.recordPostedItem(feed.id, 'gta-1', 'https://ex.com/1', 'GTA 6 rumeur annonce imminente', {
                    guildId,
                    itemContent: 'Des fuites évoquent une bande-annonce pour la fin d\'année.',
                    postedAt: Date.now() - 200000
                });

                await repo.recordPostedItem(feed.id, 'gta-2', 'https://ex.com/2', 'GTA 6 premier trailer officiel dévoilé', {
                    guildId,
                    itemContent: 'Rockstar Games publie officiellement la première bande-annonce.',
                    postedAt: Date.now() - 100000
                });

                const report = await investService.investigateTopic({
                    guildId,
                    topic: 'GTA 6',
                    limit: 5
                });

                expect(report.topic).toBe('GTA 6');
                expect(report.sourcesCount).toBeGreaterThanOrEqual(2);
                expect(report.timeline.length).toBeGreaterThanOrEqual(2);
                expect(report.consensus).toBeDefined();

                const embed = investService.buildInvestigationEmbed(report);
                expect(embed.data.title).toContain('Méta-Enquête');
            });

            it('derives canonical taxonomy tags automatically in AutofeedsSmartTagService', async () => {
                const smartTag = new AutofeedsSmartTagService();

                // Test heuristique pure sans IA
                const tagsGamingRpg = await smartTag.deriveTags({
                    title: 'Nouveau RPG Dragon Quest annoncé sur PS5 et Nintendo Switch',
                    content: 'Le studio Square Enix dévoile un gameplay exceptionnel pour ce jeu de rôle.'
                });

                expect(tagsGamingRpg).toContain('rpg');
                expect(tagsGamingRpg).toContain('playstation');
                expect(tagsGamingRpg).toContain('nintendo');

                // Test avec tags existants fusionnés sans doublons
                const merged = await smartTag.deriveTags(
                    { title: 'Patch notes et correctif hotfix déployé', content: 'Mise à jour pour corriger les bugs.' },
                    ['actualite']
                );
                expect(merged).toContain('actualite');
                expect(merged).toContain('patchnotes');
            });

            it('formats articles into Obsidian Markdown frontmatter in AutofeedsKnowledgeService', async () => {
                const knowledgeService = new AutofeedsKnowledgeService(repo);

                const item = {
                    title: 'Test complet de la RTX 5090',
                    link: 'https://tech.com/rtx-5090',
                    author: 'Nosi',
                    content: 'Voici un aperçu détaillé de l architecture Blackwell et de ses performances 4K.',
                    tags: ['hardware', 'nvidia', 'gpu'],
                    publishedAt: '2026-10-08T12:00:00Z'
                };

                const md = knowledgeService.formatObsidianMarkdown(item, { name: 'Tech Radar' });
                expect(md).toContain('---');
                expect(md).toContain('title: "Test complet de la RTX 5090"');
                expect(md).toContain('source: "Tech Radar"');
                expect(md).toContain('reading_time:');
                expect(md).toContain('- hardware');
                expect(md).toContain('# Test complet de la RTX 5090');

                expect(knowledgeService.estimateReadingTime('un deux trois')).toBe(1);

                const btn = knowledgeService.createWikiButton(999);
                expect(btn.data.custom_id).toBe('feed_wiki:999');
            });

            it('generates weekly trivia quiz and processes community answers in AutofeedsTriviaService', async () => {
                const mockXpService = {
                    xpAwarded: 0,
                    addXp: async (g, u, amount) => { mockXpService.xpAwarded += amount; }
                };

                const triviaService = new AutofeedsTriviaService(repo, null, mockXpService);
                const guildId = 'guild_v7_trivia';

                // Insérer un article pour avoir du contexte
                const feed = await repo.addFeed({ guildId, channelId: 'chan_triv', feedUrl: 'https://ex.com/triv.xml' });
                await repo.recordPostedItem(feed.id, 'triv-item-1', 'https://ex.com/article-triv', 'Annonce de la Nintendo Switch 2', {
                    guildId,
                    itemContent: 'Nintendo confirme la rétrocompatibilité.'
                });

                const quiz = await triviaService.generateWeeklyQuiz({ guildId, xpReward: 50 });
                expect(quiz).toBeDefined();
                expect(quiz.id).toBeDefined();
                expect(quiz.options.length).toBe(4);
                expect(quiz.correctIndex).toBeGreaterThanOrEqual(0);

                const embed = triviaService.buildQuizEmbed(quiz);
                expect(embed.data.title).toContain('QUIZ D\'ACTU');

                const row = triviaService.buildQuizActionRow(quiz.id);
                expect(row.components.length).toBe(4);

                // Simulation interaction bonne réponse
                let replyContent = '';
                const mockInteractionGood = {
                    user: { id: 'trivia_user_1' },
                    guildId,
                    reply: async (p) => { replyContent = p.content; }
                };

                const ansGood = await triviaService.handleAnswerInteraction(mockInteractionGood, quiz.id, quiz.correctIndex);
                expect(ansGood.ok).toBe(true);
                expect(ansGood.isCorrect).toBe(true);
                expect(mockXpService.xpAwarded).toBe(50);
                expect(replyContent).toContain('BONNE RÉPONSE');

                // Simulation tentative double soumission
                const ansDup = await triviaService.handleAnswerInteraction(mockInteractionGood, quiz.id, quiz.correctIndex);
                expect(ansDup.alreadyAnswered).toBe(true);
            });

            it('manages prediction markets, XP bets, and pool payouts in AutofeedsPredictionService', async () => {
                let userBalances = { u1: 100, u2: 100, u3: 100 };
                const mockXpService = {
                    deductXp: async (g, u, amt) => {
                        if (userBalances[u] < amt) throw new Error('Solde insuffisant');
                        userBalances[u] -= amt;
                    },
                    addXp: async (g, u, amt) => {
                        userBalances[u] += amt;
                    }
                };

                const predService = new AutofeedsPredictionService(repo, mockXpService);
                const guildId = 'guild_v7_pred';

                // 1. Création du marché
                const market = await predService.createMarket({
                    guildId,
                    title: 'Hollow Knight Silksong sortira-t-il avant fin 2026 ?',
                    options: ['OUI', 'NON'],
                    createdBy: 'admin_1'
                });

                expect(market.id).toBeDefined();
                expect(market.status).toBe('open');

                // 2. Mises des joueurs (u1 mise 40 sur OUI [0], u2 mise 60 sur OUI [0], u3 mise 100 sur NON [1])
                await predService.placeBet({ predictionId: market.id, userId: 'u1', optionIndex: 0, amountXp: 40, guildId });
                await predService.placeBet({ predictionId: market.id, userId: 'u2', optionIndex: 0, amountXp: 60, guildId });
                await predService.placeBet({ predictionId: market.id, userId: 'u3', optionIndex: 1, amountXp: 100, guildId });

                expect(userBalances.u1).toBe(60);
                expect(userBalances.u2).toBe(40);
                expect(userBalances.u3).toBe(0);

                // 3. Clôture et résolution : OUI gagne ! Pool total = 200 XP.
                // u1 a misé 40/100 du sous-pool gagnant -> reçoit 40% de 200 = 80 XP
                // u2 a misé 60/100 du sous-pool gagnant -> reçoit 60% de 200 = 120 XP
                const resolution = await predService.resolveMarket({
                    predictionId: market.id,
                    winningOptionIndex: 0,
                    resolvedBy: 'admin_mod'
                });

                expect(resolution.winnersCount).toBe(2);
                expect(resolution.totalPool).toBe(200);

                // Vérification soldes finaux
                expect(userBalances.u1).toBe(60 + 80); // 140 XP
                expect(userBalances.u2).toBe(40 + 120); // 160 XP
                expect(userBalances.u3).toBe(0); // 0 XP (a perdu)
            });

            it('exposes all v7 endpoints through AutofeedsController', async () => {
                let jsonRes = null;
                const mockRes = { json: (d) => { jsonRes = d; } };

                // 1. GET /api/autofeeds/investigate
                await controller.investigateTopic({ query: { topic: 'Zelda', guild_id: 'g_test' } }, mockRes);
                expect(jsonRes.success).toBe(true);

                // 2. POST /api/autofeeds/fact-check
                await controller.factCheckArticle({ body: { title: 'Test Fact Check', url: 'https://ex.com/fc' } }, mockRes);
                expect(jsonRes.success).toBe(true);

                // 3. POST & GET /api/autofeeds/reminders
                await controller.createReminder({ body: { guild_id: 'g_test', user_id: 'user_c', release_date: '2026-12-01', title: 'Jeu A' } }, mockRes);
                expect(jsonRes.success).toBe(true);

                await controller.listReminders({ params: { userId: 'user_c' }, query: {} }, mockRes);
                expect(jsonRes.success).toBe(true);
                expect(Array.isArray(jsonRes.data)).toBe(true);

                // 4. GET /api/autofeeds/predictions
                await controller.listPredictions({ query: { guild_id: 'g_test' } }, mockRes);
                expect(jsonRes.success).toBe(true);
                expect(Array.isArray(jsonRes.data)).toBe(true);

                // 5. POST /api/autofeeds/knowledge/export
                await controller.exportKnowledge({ body: { item: { title: 'Note Wiki', content: 'Contenu' } } }, mockRes);
                expect(jsonRes.success).toBe(true);
                expect(jsonRes.data.markdown).toContain('Note Wiki');
            });
        });
    });
});

