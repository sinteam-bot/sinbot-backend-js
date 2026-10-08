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
import { AutofeedsController } from '../src/modules/util_autofeeds/controllers/autofeeds.controller.js';

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
        await db.pool.query(`DELETE FROM autofeed_history WHERE feed_id LIKE 'feed_test_%'`);
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
        it('registers all 11 providers in registry', () => {
            const list = providerRegistry.list();
            expect(list.length).toBe(11);
            const names = list.map(p => p.name);
            expect(names).toContain('rss');
            expect(names).toContain('youtube');
            expect(names).toContain('reddit');
            expect(names).toContain('google_news');
            expect(names).toContain('twitch');
            expect(names).toContain('kick');
            expect(names).toContain('twitter');
            expect(names).toContain('tiktok');
            expect(names).toContain('instagram');
            expect(names).toContain('facebook');
            expect(names).toContain('linkedin');
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
    });
});
