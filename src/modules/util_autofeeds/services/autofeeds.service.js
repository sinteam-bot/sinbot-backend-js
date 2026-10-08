/**
 * src/modules/util_autofeeds/services/autofeeds.service.js
 *
 * Service métier pour les flux automatiques multi-sources (RSS, LootScraper, YouTube, Reddit, etc.)
 * avec gestion des catégories, tags, souscriptions utilisateurs et notifications.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { AutofeedsRepository } = require('./autofeeds.repository.js');
const { AutofeedsSubscriptionService } = require('./autofeeds-subscription.service.js');
const { AutofeedsWebhookService } = require('./autofeeds-webhook.service.js');
const { AutofeedsAiService } = require('./autofeeds-ai.service.js');
const { AutofeedsOpmlService } = require('./autofeeds-opml.service.js');
const { AutofeedsGamificationService } = require('./autofeeds-gamification.service.js');
const { AutofeedsRateLimitService } = require('./autofeeds-ratelimit.service.js');
const { AutofeedsDigestService } = require('./autofeeds-digest.service.js');
const { AutofeedsPulseService } = require('./autofeeds-pulse.service.js');
const { AutofeedsClusteringService } = require('./autofeeds-clustering.service.js');
const { AutofeedsPurgeService } = require('./autofeeds-purge.service.js');
const { AutofeedsAudioService } = require('./autofeeds-audio.service.js');
const { AutofeedsPricingService, autofeedsPricingService } = require('./autofeeds-pricing.service.js');
const { AutofeedsEventsService, autofeedsEventsService } = require('./autofeeds-events.service.js');
const { AutofeedsSecurityService, autofeedsSecurityService } = require('./autofeeds-security.service.js');
const { AutofeedsSentimentService, autofeedsSentimentService } = require('./autofeeds-sentiment.service.js');
const { AutofeedsReaderService, autofeedsReaderService } = require('./autofeeds-reader.service.js');
const { AutofeedsQaService, autofeedsQaService } = require('./autofeeds-qa.service.js');
const { AutofeedsYouTubeSummaryService, autofeedsYouTubeSummaryService } = require('./autofeeds-youtube-summary.service.js');
const { AutofeedsUserDigestService, autofeedsUserDigestService } = require('./autofeeds-user-digest.service.js');
const { communityVotingService } = require('../../../services/community-voting.service.js');
const { providerRegistry } = require('./providers/provider-registry.js');
const { PRESETS } = require('../config/presets.js');
const logger = require('../../../utils/logger.js');

class AutofeedsService {
    static inject = [
        AutofeedsRepository,
        AutofeedsSubscriptionService,
        AutofeedsWebhookService,
        AutofeedsAiService,
        AutofeedsOpmlService,
        AutofeedsGamificationService,
        AutofeedsRateLimitService,
        AutofeedsDigestService,
        AutofeedsPulseService,
        AutofeedsClusteringService,
        AutofeedsPurgeService,
        AutofeedsAudioService
    ];

    constructor(
        repo,
        subService,
        webhookService = new AutofeedsWebhookService(),
        aiService = new AutofeedsAiService(),
        opmlService = new AutofeedsOpmlService(),
        gamificationService = new AutofeedsGamificationService(repo),
        rateLimitService = new AutofeedsRateLimitService(),
        digestService = new AutofeedsDigestService(repo, aiService),
        pulseService = new AutofeedsPulseService(),
        clusteringService = new AutofeedsClusteringService(),
        purgeService = new AutofeedsPurgeService({ repository: repo }),
        audioService = new AutofeedsAudioService(),
        pricingService = autofeedsPricingService,
        eventsService = autofeedsEventsService,
        securityService = autofeedsSecurityService,
        sentimentService = autofeedsSentimentService,
        readerService = autofeedsReaderService,
        votingService = communityVotingService,
        qaService = autofeedsQaService,
        ytSummaryService = autofeedsYouTubeSummaryService,
        userDigestService = autofeedsUserDigestService
    ) {
        this.repo = repo;
        this.subService = subService;
        this.webhookService = webhookService;
        this.aiService = aiService;
        this.opmlService = opmlService;
        this.gamificationService = gamificationService;
        this.rateLimitService = rateLimitService;
        this.digestService = digestService;
        this.pulseService = pulseService;
        this.clusteringService = clusteringService;
        this.purgeService = purgeService;
        this.audioService = audioService;
        this.pricingService = pricingService;
        this.eventsService = eventsService;
        this.securityService = securityService;
        this.sentimentService = sentimentService;
        this.readerService = readerService;
        this.votingService = votingService;
        this.qaService = qaService;
        this.ytSummaryService = ytSummaryService;
        this.userDigestService = userDigestService || new AutofeedsUserDigestService(this.repo);
        if (this.userDigestService && (!this.userDigestService.repository || this.userDigestService.repository !== this.repo)) {
            this.userDigestService.repository = this.repo || this.userDigestService.repository || autofeedsRepository;
        }
        this._intervalTimer = null;
        this._client = null;

        if (this.votingService && typeof this.votingService.registerThresholdHook === 'function') {
            this.votingService.registerThresholdHook('autofeed', async (payload) => {
                await this.handleVoteThresholdReached(payload);
            });
        }
    }

    /**
     * Méthode de compatibilité descendante avec les anciens tests.
     */
    parseFeedXml(xml) {
        const rssProvider = providerRegistry.get('rss');
        return rssProvider.parseXmlFallback(xml);
    }

    /**
     * Ajoute un nouveau flux automatique.
     */
    async addFeed({
        guildId,
        channelId,
        feedUrl,
        name = null,
        feedType = null,
        category = 'general',
        tags = [],
        filters = {},
        customMessage = null,
        color = '#FF4500',
        pingRoleId = null,
        subscriberRoleId = null,
        notificationDelivery = 'channel',
        createThread = false,
        threadAutoArchiveDuration = 1440,
        useWebhook = true,
        enableMediaProxy = true,
        ignoreShorts = false,
        aiSummary = false,
        aiTranslate = null,
        digestMode = 'realtime',
        digestSchedule = '08:00',
        digestChannelId = null,
        enableGamification = false,
        gamificationXpReward = 25,
        channelTagRouting = {},
        quietHours = {},
        maxPostsPerHour = 0,
        autoReactions = [],
        autoPoll = {},
        breakingKeywords = [],
        bypassQuietHours = false,
        breakingRoleId = null,
        autoExpireDays = 0,
        enableAudioBriefing = false,
        enableVoting = false,
        bestOfThreshold = 5,
        bestOfChannelId = null,
        minDiscountPercent = 0,
        autoSyncEvents = false,
        goodVibesOnly = false,
        enableSecurityScan = true,
        translateTitleToFr = false,
        antiClickbait = false,
        requireApproval = false,
        moderationChannelId = null,
        enableStoryClustering = false,
        clusterMode = 'merge',
        enableVideoSummary = false,
        intervalMinutes = 15
    }) {
        if (!guildId || !channelId || !feedUrl) {
            return { ok: false, error: 'Paramètres manquants (salon, URL du flux).' };
        }

        // Détection automatique du fournisseur si non spécifié
        const providerName = feedType || providerRegistry.detectProvider(feedUrl);
        const provider = providerRegistry.get(providerName);
        const resolvedUrl = provider.resolveUrl(feedUrl);

        try {
            new URL(resolvedUrl);
        } catch {
            return { ok: false, error: 'URL de flux invalide.' };
        }

        // Normaliser les tags
        let parsedTags = Array.isArray(tags) ? tags : [];
        if (typeof tags === 'string') {
            parsedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        }

        // Résolution de l'intervalle selon le type de plateforme
        let resolvedInterval = parseInt(intervalMinutes, 10);
        if (isNaN(resolvedInterval) || resolvedInterval <= 0) {
            if (provider?.isLive) {
                resolvedInterval = 2; // Lives : 2 minutes
            } else if (['youtube', 'tiktok', 'social_bridge'].includes(providerName)) {
                resolvedInterval = 15; // Vidéos & réseaux : 15 minutes
            } else {
                resolvedInterval = 30; // RSS / Presse : 30 minutes
            }
        } else {
            resolvedInterval = Math.max(provider?.isLive ? 2 : 5, resolvedInterval);
        }

        // Palette de couleurs par défaut selon la plateforme
        let resolvedColor = color;
        if (!resolvedColor || resolvedColor === '#FF4500') {
            if (providerName === 'twitch') resolvedColor = '#9146FF';
            else if (providerName === 'kick') resolvedColor = '#53FC18';
            else if (providerName === 'youtube_live' || providerName === 'youtube') resolvedColor = '#FF0000';
            else if (providerName === 'github') resolvedColor = '#24292E';
            else if (providerName === 'gitlab') resolvedColor = '#FC6D26';
            else if (providerName === 'statuspage') resolvedColor = '#E02424';
            else if (providerName === 'steam') resolvedColor = '#1B2838';
            else resolvedColor = '#FF4500';
        }

        const feed = await this.repo.addFeed({
            guildId,
            channelId,
            feedUrl: resolvedUrl,
            name: name ? name.trim() : null,
            feedType: providerName,
            category: (category || 'general').trim().toLowerCase(),
            tags: parsedTags,
            filters: filters || {},
            customMessage,
            color: resolvedColor,
            pingRoleId,
            subscriberRoleId,
            notificationDelivery,
            createThread,
            threadAutoArchiveDuration,
            useWebhook,
            enableMediaProxy,
            ignoreShorts,
            aiSummary,
            aiTranslate,
            digestMode,
            digestSchedule,
            digestChannelId,
            enableGamification,
            gamificationXpReward,
            channelTagRouting,
            quietHours,
            maxPostsPerHour,
            autoReactions,
            autoPoll,
            breakingKeywords,
            bypassQuietHours,
            breakingRoleId,
            autoExpireDays,
            enableAudioBriefing,
            enableVoting,
            bestOfThreshold,
            bestOfChannelId,
            minDiscountPercent,
            autoSyncEvents,
            goodVibesOnly,
            enableSecurityScan,
            translateTitleToFr,
            antiClickbait,
            requireApproval,
            moderationChannelId,
            enableStoryClustering,
            clusterMode,
            enableVideoSummary,
            intervalMinutes: resolvedInterval
        });

        logger.info(`Autofeed ${feed.id} (${providerName}) ajouté pour ${resolvedUrl} sur guilde ${guildId}`, 'AUTOFEEDS');
        return { ok: true, data: feed };
    }

    /**
     * Installe un preset en 1-clic (ex: LootScraper Epic, Steam, etc.).
     */
    async installPreset(guildId, channelId, presetId, options = {}) {
        const preset = PRESETS.find(p => p.id === presetId);
        if (!preset) {
            return { ok: false, error: `Preset "${presetId}" introuvable.` };
        }

        return this.addFeed({
            guildId,
            channelId,
            feedUrl: preset.feedUrl,
            name: preset.name,
            feedType: preset.provider || 'rss',
            category: preset.category || 'gaming',
            tags: preset.tags || [],
            color: preset.color || '#FEE75C',
            intervalMinutes: options.intervalMinutes || 15,
            customMessage: options.customMessage || null
        });
    }

    async getFeed(id) {
        return this.repo.getFeedById(id);
    }

    async listFeeds(guildId) {
        return this.repo.listByGuild(guildId);
    }

    async updateFeed(id, patch) {
        const updated = await this.repo.updateFeed(id, patch);
        if (!updated) {
            return { ok: false, error: 'Flux introuvable.' };
        }
        return { ok: true, data: updated };
    }

    async deleteFeed(id) {
        await this.repo.deleteFeed(id);
        return { ok: true };
    }

    /**
     * Convertit une URL Twitter/TikTok en passerelle média directe si activé.
     */
    getProxiedMediaLink(url) {
        if (!url || typeof url !== 'string') return url;

        if (url.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com/i)) {
            return url.replace(/https?:\/\/(?:www\.)?(?:twitter|x)\.com/i, 'https://fxtwitter.com');
        }
        if (url.match(/https?:\/\/vm\.tiktok\.com/i)) {
            return url.replace(/https?:\/\/vm\.tiktok\.com/i, 'https://vm.vxtiktok.com');
        }
        if (url.match(/https?:\/\/(?:www\.)?tiktok\.com/i)) {
            return url.replace(/https?:\/\/(?:www\.)?tiktok\.com/i, 'https://vxtiktok.com');
        }
        return url;
    }

    /**
     * Importe un fichier OPML pour une guilde dans un salon cible.
     */
    async importOpml(arg1, maybeChannelId, maybeOpmlXml) {
        let guildId, channelId, opmlXml;
        if (arg1 && typeof arg1 === 'object') {
            guildId = arg1.guildId;
            channelId = arg1.channelId;
            opmlXml = arg1.opmlXml;
        } else {
            guildId = arg1;
            channelId = maybeChannelId;
            opmlXml = maybeOpmlXml;
        }

        const parsed = await this.opmlService.parseOpml(opmlXml);
        const imported = [];
        const errors = [];

        for (const item of parsed) {
            try {
                const res = await this.addFeed({
                    guildId,
                    channelId,
                    feedUrl: item.feedUrl || item.xmlUrl,
                    name: item.name || item.title,
                    category: item.category,
                    tags: item.tags
                });
                if (res.ok) {
                    imported.push(res.data);
                } else {
                    errors.push({ feedUrl: item.feedUrl || item.xmlUrl, error: res.error });
                }
            } catch (err) {
                errors.push({ feedUrl: item.feedUrl || item.xmlUrl, error: err.message });
            }
        }

        return { ok: true, importedCount: imported.length, imported, errors };
    }

    /**
     * Exporte les flux d'une guilde au format XML OPML standard.
     */
    async exportOpml(guildId, guildName = 'Serveur Discord') {
        const feeds = await this.repo.listByGuild(guildId);
        return this.opmlService.generateOpml(feeds, guildName);
    }

    /**
     * Génère l'embed Discord riche pour un article de flux.
     */
    buildDiscordEmbed(feed, item) {
        const isBreaking = this.isBreakingItem(feed, item);
        let color = typeof feed.color === 'string'
            ? parseInt(feed.color.replace('#', ''), 16) || 0xFF4500
            : 0xFF4500;

        if (isBreaking) {
            color = 0xED4245; // Rouge vif pour Breaking News
        }

        const provider = providerRegistry.get(feed.feedType);
        const sourceIcon = isBreaking ? '🚨' : (provider?.icon || '📰');
        const sourceLabel = feed.name || provider?.label || 'Flux RSS';
        const titlePrefix = isBreaking ? '🚨 FLASH INFO : ' : '';

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${sourceIcon} ${titlePrefix}${item.title.slice(0, 240)}`)
            .setURL(item.link || feed.feedUrl)
            .setTimestamp(item.publishedAt ? new Date(item.publishedAt) : new Date());

        if (item.content) {
            embed.setDescription(item.content);
        }

        if (item.imageUrl) {
            embed.setImage(item.imageUrl);
        }

        // Champs de métadonnées
        const fields = [];
        if (isBreaking) {
            fields.push({ name: '⚡ Alerte Flash', value: 'Publication prioritaire.', inline: false });
        }

        if (feed.category && feed.category !== 'general') {
            fields.push({ name: '📁 Catégorie', value: `\`${feed.category.toUpperCase()}\``, inline: true });
        }

        if (item.author) {
            fields.push({ name: '✍️ Auteur', value: item.author, inline: true });
        }

        const combinedTags = Array.from(new Set([...(feed.tags || []), ...(item.tags || [])]));
        if (combinedTags.length > 0) {
            const formattedTags = combinedTags.slice(0, 6).map(t => `\`#${t}\``).join(' ');
            fields.push({ name: '🏷️ Tags', value: formattedTags, inline: false });
        }

        if (item.extra?.game || item.extra?.category) {
            fields.push({ name: '🎮 Jeu / Catégorie', value: `\`${item.extra.game || item.extra.category}\``, inline: true });
        }
        if (item.extra?.viewers != null) {
            fields.push({ name: '👥 Spectateurs', value: `\`${Number(item.extra.viewers).toLocaleString('fr-FR')}\``, inline: true });
        }

        if (item.extra?.aiSummary) {
            fields.unshift({ name: '💡 Résumé IA (TL;DR)', value: item.extra.aiSummary.slice(0, 1024), inline: false });
        }
        if (item.extra?.aiTranslation?.description) {
            fields.unshift({ name: '🇫🇷 Traduction', value: item.extra.aiTranslation.description.slice(0, 1024), inline: false });
        }
        if (item.extra?.priceInfo?.badgeText) {
            fields.push({ name: '💰 Bon Plan & Prix', value: item.extra.priceInfo.badgeText, inline: false });
        }
        if (item.extra?.sentiment && item.extra.sentiment.category !== 'neutral') {
            fields.push({ name: '🎭 Ambiance', value: item.extra.sentiment.badgeText, inline: true });
        }

        if (item.extra?.clickbaitClarification) {
            fields.push({ name: '🔍 Titre clarifié (Anti-clickbait)', value: `Titre d'origine : *${item.extra.clickbaitClarification.slice(0, 500)}*`, inline: false });
        }
        if (item.extra?.videoSummary) {
            fields.unshift({ name: '🎥 Résumé Vidéo IA', value: item.extra.videoSummary.slice(0, 1024), inline: false });
        }
        if (Array.isArray(item.extra?.relatedSources) && item.extra.relatedSources.length > 0) {
            const sourcesList = item.extra.relatedSources
                .slice(0, 4)
                .map(s => `• [${s.feedName || 'Autre source'}](${s.link}) : ${s.title ? s.title.slice(0, 60) : 'Lire'}`)
                .join('\n');
            fields.push({ name: '🌐 Sources liées (Multi-flux)', value: sourcesList.slice(0, 1024), inline: false });
        }
        if (item.extra?.isPendingApproval) {
            fields.unshift({ name: '🛡️ En attente de modération', value: 'Cette actualité doit être validée avant publication dans le salon public.', inline: false });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        embed.setFooter({ text: `${sourceLabel} • ${feed.category || 'actualités'}` });

        return embed;
    }

    /**
     * Génère la ligne d'action Discord avec bouton de lien direct et souscription rapide.
     */
    buildActionRow(feed, item) {
        const row = new ActionRowBuilder();
        const provider = providerRegistry.get(feed.feedType);

        // 1. Bouton Lien direct vers le contenu ou live
        if (item.link && (item.link.startsWith('http://') || item.link.startsWith('https://'))) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel(provider?.isLive ? "🔴 Regarder le Live" : "Voir l'article")
                    .setEmoji(provider?.isLive ? '🔴' : '🔗')
                    .setStyle(ButtonStyle.Link)
                    .setURL(item.link)
            );
        }

        // 2. Bouton Souscription au tag principal s'il y en a un
        const primaryTag = (feed.tags && feed.tags[0]) || (item.tags && item.tags[0]) || feed.category || null;
        if (primaryTag) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`autofeed:sub:tag:${primaryTag.toLowerCase()}`)
                    .setLabel(`Suivre #${primaryTag}`)
                    .setEmoji('🔔')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        // 3. Bouton Souscription au créateur/auteur s'il est spécifié
        if (item.author) {
            const authorClean = item.author.replace('@', '').trim();
            if (authorClean && (!primaryTag || authorClean.toLowerCase() !== primaryTag.toLowerCase())) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`autofeed:sub:author:${authorClean.toLowerCase().slice(0, 40)}`)
                        .setLabel(`Suivre @${authorClean.slice(0, 20)}`)
                        .setEmoji('👤')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
        }

        // 4. Bouton Drop Hunter / Gamification
        if (feed.enableGamification && this.gamificationService && row.components.length < 5) {
            const itemId = item.id || item.link || 'item';
            row.addComponents(
                this.gamificationService.createClaimButton(feed.id, itemId, 0)
            );
        }

        return row.components.length > 0 ? row : null;
    }

    /**
     * Génère l'ensemble des ActionRows pour un message, incluant les boutons d'action et de vote.
     * @param {object} feed
     * @param {object} item
     * @param {string|number} [historyId]
     * @returns {ActionRowBuilder[]}
     */
    buildComponentRows(feed, item, historyId = null) {
        const rows = [];
        const actionRow = this.buildActionRow(feed, item);
        if (actionRow) {
            rows.push(actionRow);
        }

        // ActionRow d'interactions IA (Traduction, Q&A, Résumé Vidéo)
        const aiRow = new ActionRowBuilder();
        const itemId = historyId || item.id || item.link || 'item';

        aiRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`feed_trans:${itemId}`)
                .setLabel('Traduire')
                .setEmoji('🌐')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`feed_qa:${itemId}`)
                .setLabel('Poser une question')
                .setEmoji('💬')
                .setStyle(ButtonStyle.Secondary)
        );

        if (feed.feedType === 'youtube' || feed.enableVideoSummary || (item.link && item.link.includes('youtu'))) {
            aiRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`feed_vsum:${itemId}`)
                    .setLabel('Résumé Vidéo')
                    .setEmoji('📝')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (aiRow.components.length > 0) {
            rows.push(aiRow);
        }

        if (feed.enableVoting && this.votingService) {
            const voteTargetId = item.id || item.link || item.guid || 'item';
            const voteRow = this.votingService.buildVoteRow({
                targetType: 'autofeed',
                targetId: voteTargetId,
                upvotes: 0,
                downvotes: 0
            });
            if (voteRow) {
                rows.push(voteRow);
            }
        }

        return rows;
    }

    /**
     * Résout le salon Discord cible selon les tags de l'article et la table de routage.
     * @param {object} feed
     * @param {object} item
     * @returns {string} channelId cible
     */
    resolveTargetChannel(feed, item) {
        if (!feed.channelTagRouting) return feed.channelId;
        const routing = typeof feed.channelTagRouting === 'string' ? JSON.parse(feed.channelTagRouting) : feed.channelTagRouting;
        if (!routing || typeof routing !== 'object' || Object.keys(routing).length === 0) {
            return feed.channelId;
        }

        const allTags = [...(feed.tags || []), ...(item?.tags || []), feed.category]
            .filter(Boolean)
            .map(t => String(t).toLowerCase().trim());

        for (const [tagKey, targetChannelId] of Object.entries(routing)) {
            const cleanKey = tagKey.toLowerCase().replace(/^#/, '').trim();
            if (targetChannelId && (allTags.includes(cleanKey) || allTags.includes(`#${cleanKey}`))) {
                return targetChannelId;
            }
        }
        return feed.channelId;
    }

    _filterItems(feed, items = []) {
        const provider = providerRegistry.get(feed.feedType || 'rss') || providerRegistry.get('rss');
        return items.filter(it => {
            if (feed.ignoreShorts && (feed.feedType === 'youtube' || feed.feedType === 'youtube_live')) {
                const yt = providerRegistry.get('youtube');
                if (yt && typeof yt.isShort === 'function' && yt.isShort(it)) {
                    return false;
                }
            }
            return provider ? provider.matchesFilters(it, feed.filters) : true;
        });
    }

    /**
     * Analyse et publie les nouveaux articles d'un flux spécifique.
     */
    async _checkSingleFeed(feed, client, force = false) {
        const now = Date.now();
        const intervalMs = (feed.intervalMinutes || 15) * 60 * 1000;

        // Respect de l'intervalle individuel sauf si forcé
        if (!force && feed.lastCheckedAt && (now - feed.lastCheckedAt < intervalMs)) {
            return;
        }

        try {
            const provider = providerRegistry.get(feed.feedType);
            const isLiveFeed = Boolean(provider?.isLive);
            const items = await provider.fetchItems(feed);

            if (!items || items.length === 0) {
                // Si c'est un flux de stream en direct et qu'il était en live, gérer la fin de diffusion
                if (isLiveFeed) {
                    await this._handleLiveStreamOffline(feed, client, provider);
                }
                await this.repo.recordFeedCheckResult(feed.id, { status: 'ok' });
                return;
            }

            // Gestion spécialisée pour les diffusions en direct
            if (isLiveFeed) {
                await this._handleLiveStreamOnline(feed, client, provider, items[0]);
                await this.repo.recordFeedCheckResult(feed.id, {
                    status: 'ok',
                    lastItemId: items[0].id,
                    lastItemPublishedAt: items[0].publishedAt || now
                });
                return;
            }

            // Filtrer par filtres de mots-clés et shorts
            const filteredItems = this._filterItems(feed, items);

            // Filtrer les nouveaux articles : date plus récente et pas encore présent dans l'historique
            const newItems = [];
            for (const item of filteredItems) {
                if (item.publishedAt > feed.lastItemPublishedAt && item.id !== feed.lastItemId) {
                    const alreadyPosted = await this.repo.hasItemBeenPosted(feed.id, item.id);
                    if (!alreadyPosted) {
                        newItems.push(item);
                    }
                }
            }

            // Trier du plus ancien au plus récent
            newItems.sort((a, b) => a.publishedAt - b.publishedAt);

            if (newItems.length === 0) {
                await this.repo.recordFeedCheckResult(feed.id, { status: 'ok' });
                return;
            }

            // Prendre le plus récent pour la mise à jour de la date
            const latest = newItems[newItems.length - 1];

            // Limiter à 5 articles simultanés max pour éviter le spam lors d'une première activation
            const toPost = newItems.slice(-5);

            // Mode Digest (périodique / gazette) : on accumule dans le service Digest au lieu d'envoyer immédiatement
            if (feed.digestMode && feed.digestMode !== 'realtime' && this.digestService) {
                for (const item of toPost) {
                    this.digestService.accumulateItem(feed.id, item);
                    await this.repo.recordPostedItem(feed.id, item.id, item.link, item.title, {
                        guildId: feed.guildId,
                        itemAuthor: item.author,
                        itemContent: item.contentSnippet,
                        tags: item.tags,
                        isDigest: true
                    });
                }
                await this.repo.recordFeedCheckResult(feed.id, {
                    status: 'ok',
                    lastItemId: latest.id,
                    lastItemPublishedAt: latest.publishedAt
                });
                return;
            }

            if (client && client.channels) {
                for (const item of toPost) {
                    const isBreaking = this.isBreakingItem(feed, item);
                    const shouldBypassQuiet = isBreaking && (feed.bypassQuietHours || (Array.isArray(feed.breakingKeywords) && feed.breakingKeywords.length > 0));

                    // Vérification du débit horaire (Anti-flood / Rate limiting, sauf si bypass Breaking)
                    if (feed.maxPostsPerHour > 0 && !shouldBypassQuiet && this.rateLimitService && !this.rateLimitService.checkRateLimit(feed.id, feed.maxPostsPerHour)) {
                        logger.info(`[Autofeeds] Débit horaire dépassé pour le flux ${feed.id} (max: ${feed.maxPostsPerHour}/h)`, 'AUTOFEEDS');
                        continue;
                    }

                    // Résolution du salon cible avec routage dynamique par tag
                    const targetChannelId = this.resolveTargetChannel(feed, item);
                    const channel = client.channels.cache?.get(targetChannelId) 
                        || (client.channels.fetch ? await client.channels.fetch(targetChannelId).catch(() => null) : null);

                    if (!channel) continue;

                    // Bouclier Anti-Phishing & Déplieur d'URLs
                    if (this.securityService && feed.enableSecurityScan !== false && item.link) {
                        const safety = await this.securityService.checkUrlSafety(item.link);
                        if (!safety.safe) {
                            logger.warn(`[AutofeedsSecurity] Lien bloqué pour "${item.title}": ${safety.reason}`, 'AUTOFEEDS');
                            continue;
                        }
                        if (safety.expandedUrl && safety.expandedUrl !== item.link) {
                            item.link = safety.expandedUrl;
                            item.url = safety.expandedUrl;
                        }
                    }

                    // Filtre d'Humeur & "Good Vibes Only"
                    if (this.sentimentService) {
                        const sentiment = this.sentimentService.analyzeSentiment(item.contentSnippet || item.summary || '', item.title || '');
                        item.extra = { ...(item.extra || {}), sentiment };
                        if (feed.goodVibesOnly && this.sentimentService.shouldFilterGoodVibes(sentiment.score, true)) {
                            logger.info(`[AutofeedsSentiment] Article filtré en mode Good Vibes Only (score: ${sentiment.score}): "${item.title}"`, 'AUTOFEEDS');
                            continue;
                        }
                    }

                    // Traqueur de Prix & All-Time Low
                    if (this.pricingService) {
                        const priceInfo = this.pricingService.extractPriceInfo(item.contentSnippet || item.summary || '', item.title || '');
                        if (priceInfo.hasPrice) {
                            if (this.pricingService.shouldFilterByDiscount(priceInfo.discountPercent, feed.minDiscountPercent)) {
                                logger.info(`[AutofeedsPricing] Offre ignorée car réduction ${priceInfo.discountPercent}% < minimum requis ${feed.minDiscountPercent}%`, 'AUTOFEEDS');
                                continue;
                            }
                            const priceHistory = await this.repo.getPriceHistory(item.link || item.url);
                            const analyzedDeal = this.pricingService.analyzeDeal(priceInfo, priceHistory);
                            item.extra = { ...(item.extra || {}), priceInfo: analyzedDeal };
                            await this.repo.recordPriceHistory({
                                feedId: feed.id,
                                itemUrl: item.link || item.url,
                                itemTitle: item.title,
                                originalPrice: analyzedDeal.originalPrice,
                                currentPrice: analyzedDeal.currentPrice,
                                discountPercent: analyzedDeal.discountPercent,
                                currency: analyzedDeal.currency,
                                isAllTimeLow: analyzedDeal.isAllTimeLow
                            });
                        }
                    }

                    // Synchronisation automatique des Événements Programmés Discord
                    if (this.eventsService && feed.autoSyncEvents && channel.guild) {
                        await this.eventsService.syncGuildScheduledEvent(channel.guild, item);
                    }

                    // Déduplication & News Clustering Cross-Flux
                    if (this.clusteringService && !isBreaking) {
                        const recentItems = await this.repo.findRecentHistoryForClustering(feed.guildId, 6);
                        const cluster = this.clusteringService.findClusterCandidate(item, recentItems, 0.70);
                        if (cluster) {
                            logger.info(`[Autofeeds] Article "${item.title}" clusterisé avec l'entrée ${cluster.candidate.id} (${cluster.reason})`, 'AUTOFEEDS');
                            if (feed.enableStoryClustering && feed.clusterMode === 'merge') {
                                const relEntry = this.clusteringService.createRelatedSourceEntry(feed, item);
                                await this.repo.addRelatedSourceToHistory(cluster.candidate.id, relEntry);
                            }
                            await this.repo.recordPostedItem(feed.id, item.id, item.link, item.title, {
                                guildId: feed.guildId,
                                channelId: targetChannelId,
                                messageId: cluster.candidate.messageId || null,
                                canonicalUrl: this.clusteringService.normalizeUrl(item.link || item.url),
                                itemAuthor: item.author,
                                itemContent: item.contentSnippet,
                                tags: item.tags,
                                isDigest: false,
                                clusteredWithId: cluster.candidate.id,
                                sentimentScore: item.extra?.sentiment?.score != null ? String(item.extra.sentiment.score) : null
                            });
                            continue; // Doublon détecté et consigné sans reposter !
                        }
                    }

                    if (channel.send || channel.threads?.create) {
                        // Traduction du titre vers le français si activé
                        if (feed.translateTitleToFr && this.aiService && item.title) {
                            const translated = await this.aiService.translateTitle(item.title, 'fr');
                            if (translated && translated !== item.title) {
                                item.extra = { ...(item.extra || {}), originalForeignTitle: item.title };
                                item.title = `🇫🇷 ${translated}`;
                            }
                        }

                        // Anti-Clickbait & Titres Factuels
                        if (feed.antiClickbait && this.aiService) {
                            const cb = await this.aiService.sanitizeClickbaitTitle(item);
                            if (cb && cb.isClickbait) {
                                item.extra = { ...(item.extra || {}), clickbaitClarification: cb.originalTitle };
                                item.title = `🔍 ${cb.sanitizedTitle}`;
                            }
                        }

                        // Résumé Vidéo YouTube automatique
                        if (feed.enableVideoSummary && this.ytSummaryService && item.link) {
                            try {
                                const vsum = await this.ytSummaryService.summarizeVideo({
                                    url: item.link,
                                    title: item.title,
                                    description: item.contentSnippet || item.content
                                });
                                if (vsum?.summary) {
                                    item.extra = { ...(item.extra || {}), videoSummary: vsum.summary };
                                }
                            } catch (vErr) {
                                logger.warn(`[AutofeedsYouTube] Échec résumé auto: ${vErr.message}`, 'AUTOFEEDS');
                            }
                        }

                        // Enrichissement IA si configuré
                        if (feed.aiSummary && this.aiService) {
                            const summary = await this.aiService.generateSummary(item);
                            if (summary) item.extra = { ...(item.extra || {}), aiSummary: summary };
                        }
                        if (feed.aiTranslate && this.aiService) {
                            const trans = await this.aiService.translateItem(item, feed.aiTranslate);
                            if (trans) item.extra = { ...(item.extra || {}), aiTranslation: trans };
                        }

                        // Media proxy (fxtwitter / vxtiktok)
                        if (feed.enableMediaProxy !== false && item.link) {
                            const proxied = this.getProxiedMediaLink(item.link);
                            if (proxied !== item.link) {
                                item.extra = { ...(item.extra || {}), proxiedLink: proxied };
                            }
                        }

                        // Salle d'attente de modération & Validation Manuelle
                        if (feed.requireApproval && feed.moderationChannelId) {
                            const modChan = client.channels.cache?.get(feed.moderationChannelId)
                                || (client.channels.fetch ? await client.channels.fetch(feed.moderationChannelId).catch(() => null) : null);
                            if (modChan && modChan.send) {
                                item.extra = { ...(item.extra || {}), isPendingApproval: true };
                                const modEmbed = this.buildDiscordEmbed(feed, item);
                                const pendingHist = await this.repo.recordPostedItem(feed.id, item.id, item.link, item.title, {
                                    guildId: feed.guildId,
                                    channelId: targetChannelId,
                                    messageId: null,
                                    canonicalUrl: this.clusteringService ? this.clusteringService.normalizeUrl(item.link || item.url) : item.link,
                                    itemAuthor: item.author,
                                    itemContent: item.contentSnippet,
                                    tags: item.tags,
                                    isDigest: false,
                                    isPendingApproval: true
                                });

                                const modRow = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`feed_mod:approve:${pendingHist.id}`)
                                        .setLabel('Approuver & Publier')
                                        .setEmoji('✅')
                                        .setStyle(ButtonStyle.Success),
                                    new ButtonBuilder()
                                        .setCustomId(`feed_mod:reject:${pendingHist.id}`)
                                        .setLabel('Rejeter')
                                        .setEmoji('❌')
                                        .setStyle(ButtonStyle.Danger)
                                );

                                await modChan.send({
                                    content: `🛡️ **Nouvelle actualité en attente de validation** (Cible : <#${targetChannelId}>)`,
                                    embeds: [modEmbed],
                                    components: [modRow]
                                }).catch(err => {
                                    logger.warn(`[Autofeeds] Erreur envoi moderation ${feed.moderationChannelId}: ${err.message}`, 'AUTOFEEDS');
                                });

                                continue; // Stoppe ici : ne publie pas dans le salon public !
                            }
                        }

                        const embed = this.buildDiscordEmbed(feed, item);
                        const componentRows = this.buildComponentRows(feed, item);

                        // Détecter les souscripteurs à notifier
                        const { mentionUserIds, dmUserIds } = await this.subService.findMatchingSubscribers(feed.guildId, feed, item);

                        // Construire le message texte (mentions + ping de rôle)
                        const pings = [];
                        if (isBreaking && feed.breakingRoleId) {
                            pings.push(`<@&${feed.breakingRoleId}>`);
                        }
                        if (feed.pingRoleId) {
                            pings.push(`<@&${feed.pingRoleId}>`);
                        }
                        if (mentionUserIds.length > 0) {
                            pings.push(mentionUserIds.map(uid => `<@${uid}>`).join(' '));
                        }

                        // Neutralisation des pings en heures silencieuses (sauf si bypass Breaking)
                        if (!shouldBypassQuiet && this.rateLimitService?.shouldSuppressMentions(feed)) {
                            pings.length = 0;
                        }

                        let messageContent = '';
                        if (feed.customMessage) {
                            messageContent = feed.customMessage
                                .replace(/{title}/gi, item.title)
                                .replace(/{link}/gi, item.link || '')
                                .replace(/{url}/gi, item.link || '')
                                .replace(/{author}/gi, item.author || '')
                                .replace(/{mentions}/gi, pings.join(' '));
                        } else if (pings.length > 0) {
                            messageContent = `🔔 ${pings.join(' ')}`;
                        }

                        // Si lien média proxied (vidéo Twitter/TikTok), l'ajouter au texte pour rendu player Discord
                        if (feed.enableMediaProxy !== false && item.extra?.proxiedLink && !messageContent.includes(item.extra.proxiedLink)) {
                            messageContent = messageContent ? `${messageContent}\n${item.extra.proxiedLink}` : item.extra.proxiedLink;
                        }

                        const sendPayload = {
                            embeds: [embed]
                        };
                        if (messageContent.trim()) {
                            sendPayload.content = messageContent;
                        }
                        if (componentRows.length > 0) {
                            sendPayload.components = componentRows;
                        }

                        let sentMsg = null;

                        // Envoi : Forum Discord ou Salon textuel (avec tentative Webhook personnalisé)
                        const isForum = Boolean(channel.isThreadOnly?.() || channel.type === 15);
                        if (isForum && channel.threads?.create) {
                            const postName = (item.title || feed.name || 'Nouvel article').slice(0, 95);
                            const appliedTags = [];
                            if (channel.availableTags && Array.isArray(channel.availableTags)) {
                                const allTags = [...(feed.tags || []), ...(item.tags || []), feed.category].map(t => t?.toLowerCase());
                                for (const t of channel.availableTags) {
                                    if (allTags.includes(t.name.toLowerCase())) {
                                        appliedTags.push(t.id);
                                    }
                                }
                            }
                            const thread = await channel.threads.create({
                                name: postName,
                                message: sendPayload,
                                appliedTags: appliedTags.slice(0, 5)
                            }).catch(err => {
                                logger.warn(`[Autofeeds] Erreur post forum ${targetChannelId}: ${err.message}`, 'AUTOFEEDS');
                            });
                            sentMsg = thread?.message || thread;
                        } else {
                            let sent = false;
                            if (feed.useWebhook !== false && this.webhookService) {
                                sent = await this.webhookService.sendViaWebhook(channel, client, sendPayload, feed, item);
                            }
                            if (!sent && channel.send) {
                                sentMsg = await channel.send(sendPayload).catch(err => {
                                    logger.warn(`[Autofeeds] Erreur envoi channel ${targetChannelId}: ${err.message}`, 'AUTOFEEDS');
                                });
                            }
                        }

                        // Community Pulse : Réactions et sondages automatiques
                        if (sentMsg && this.pulseService) {
                            if (Array.isArray(feed.autoReactions) && feed.autoReactions.length > 0) {
                                await this.pulseService.applyAutoReactions(sentMsg, feed.autoReactions);
                            }
                            if (feed.autoPoll) {
                                const pollPayload = this.pulseService.buildPollPayload(feed, item);
                                if (pollPayload) {
                                    await this.pulseService.sendAutoPoll(channel, pollPayload);
                                }
                            }
                        }

                        // Envoi des notifications privées en DM
                        if (dmUserIds.length > 0) {
                            for (const dmUid of dmUserIds) {
                                try {
                                    const user = client.users?.fetch ? await client.users.fetch(dmUid).catch(() => null) : null;
                                    if (user && user.send) {
                                        await user.send({
                                            content: `🔔 Nouvel article correspondant à vos abonnements sur le serveur :`,
                                            embeds: [embed],
                                            components: componentRows
                                        }).catch(() => {});
                                    }
                                } catch {}
                            }
                        }

                        // Enregistrement dans l'historique anti-doublon & recherche
                        await this.repo.recordPostedItem(feed.id, item.id, item.link, item.title, {
                            guildId: feed.guildId,
                            channelId: targetChannelId,
                            messageId: sentMsg?.id || null,
                            canonicalUrl: this.clusteringService ? this.clusteringService.normalizeUrl(item.link || item.url) : item.link,
                            itemAuthor: item.author,
                            itemContent: item.contentSnippet,
                            tags: item.tags,
                            isDigest: false,
                            sentimentScore: item.extra?.sentiment?.score != null ? String(item.extra.sentiment.score) : null
                        });
                    }
                }
            }

            await this.repo.recordFeedCheckResult(feed.id, {
                status: 'ok',
                lastItemId: latest.id,
                lastItemPublishedAt: latest.publishedAt
            });
        } catch (err) {
            logger.warn(`Erreur check feed ${feed.id}: ${err.message}`, 'AUTOFEEDS');
            const checkRes = await this.repo.recordFeedCheckResult(feed.id, {
                status: 'error',
                error: err.message
            });
            if (checkRes) {
                if (checkRes.failCount === 3) {
                    await this._sendAdminLogAlert(feed, client, {
                        type: 'warning',
                        failCount: 3,
                        error: err.message
                    });
                } else if (checkRes.autoDisabled) {
                    await this._sendAdminLogAlert(feed, client, {
                        type: 'disabled',
                        failCount: checkRes.failCount,
                        error: err.message
                    });
                }
            }
        }
    }

    /**
     * Envoie une alerte dans les logs Discord (3 échecs consécutifs ou désactivation auto à 10 échecs).
     */
    async _sendAdminLogAlert(feed, client, { type, failCount, error }) {
        if (!client || !feed) return;
        try {
            const { getConfig } = require('../../../config/index.js');
            const { getFeatureConfig } = require('../../../config/c12-loader.js');
            const guildCfg = await getFeatureConfig(feed.guildId, 'autofeeds').catch(() => ({}));
            const globalCfg = getConfig().autofeeds || {};
            const logChannelId = guildCfg.log_channel_id || globalCfg.log_channel_id;

            let logChannel = null;
            if (logChannelId && client.channels) {
                logChannel = client.channels.cache?.get(logChannelId)
                    || (client.channels.fetch ? await client.channels.fetch(logChannelId).catch(() => null) : null);
            }
            if (!logChannel && client.guilds) {
                const guild = client.guilds.cache?.get(feed.guildId)
                    || (client.guilds.fetch ? await client.guilds.fetch(feed.guildId).catch(() => null) : null);
                if (guild) {
                    logChannel = guild.systemChannel || guild.publicUpdatesChannel || null;
                }
            }

            if (logChannel && logChannel.send) {
                const isDis = type === 'disabled';
                const embed = new EmbedBuilder()
                    .setColor(isDis ? 0xED4245 : 0xFEE75C)
                    .setTitle(isDis ? `🛑 [Autofeeds] Flux désactivé (${feed.name || feed.id})` : `⚠️ [Autofeeds] Erreurs récurrentes (${feed.name || feed.id})`)
                    .setDescription(
                        isDis
                            ? `Le flux **${feed.name || feed.feedUrl}** a rencontré **${failCount} échecs consécutifs** et a été désactivé automatiquement pour préserver les performances.`
                            : `Le flux **${feed.name || feed.feedUrl}** a rencontré **${failCount} échecs consécutifs** lors des vérifications automatiques.`
                    )
                    .addFields(
                        { name: 'URL du flux', value: `\`${feed.feedUrl}\``, inline: false },
                        { name: 'Dernière erreur', value: `\`\`\`${String(error || 'Inconnue').slice(0, 500)}\`\`\``, inline: false }
                    )
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        } catch (alertErr) {
            logger.warn(`[Autofeeds] Impossible d'envoyer l'alerte log: ${alertErr.message}`, 'AUTOFEEDS');
        }
    }

    /**
     * Traite l'ouverture d'une session de live en direct.
     */
    async _handleLiveStreamOnline(feed, client, provider, streamItem) {
        if (!provider.matchesFilters(streamItem, feed.filters)) {
            return;
        }

        const activeSession = await this.repo.getActiveLiveSession(feed.id);
        const streamerName = streamItem.author || feed.name || 'Streamer';
        const gameName = streamItem.extra?.game || streamItem.extra?.category || null;

        // Si une session est déjà en cours, on ne reposte pas de nouvelle alerte
        if (activeSession) {
            return;
        }

        // Vérifier si ce live spécifique a déjà été posté
        const alreadyPosted = await this.repo.hasItemBeenPosted(feed.id, streamItem.id);
        if (alreadyPosted) {
            return;
        }

        if (client && client.channels) {
            const channel = client.channels.cache?.get(feed.channelId) 
                || (client.channels.fetch ? await client.channels.fetch(feed.channelId).catch(() => null) : null);

            if (channel && channel.send) {
                const embed = this.buildDiscordEmbed(feed, streamItem);
                const actionRow = this.buildActionRow(feed, streamItem);

                // Détecter les souscripteurs
                const { mentionUserIds, dmUserIds } = await this.subService.findMatchingSubscribers(feed.guildId, feed, streamItem);

                // Mentions et ping
                const pings = [];
                if (feed.pingRoleId) {
                    pings.push(`<@&${feed.pingRoleId}>`);
                }
                if (feed.subscriberRoleId && feed.subscriberRoleId !== feed.pingRoleId) {
                    pings.push(`<@&${feed.subscriberRoleId}>`);
                }
                if (mentionUserIds.length > 0) {
                    pings.push(mentionUserIds.map(uid => `<@${uid}>`).join(' '));
                }

                const viewersCount = streamItem.extra?.viewers != null ? String(streamItem.extra.viewers) : 'N/C';
                let messageContent = '';
                if (feed.customMessage) {
                    messageContent = feed.customMessage
                        .replace(/{streamer}/gi, streamerName)
                        .replace(/{title}/gi, streamItem.title)
                        .replace(/{game}/gi, gameName || 'Non spécifié')
                        .replace(/{viewers}/gi, viewersCount)
                        .replace(/{url}/gi, streamItem.link || '')
                        .replace(/{link}/gi, streamItem.link || '')
                        .replace(/{mentions}/gi, pings.join(' '));
                } else if (pings.length > 0) {
                    messageContent = `🔴 ${pings.join(' ')}`;
                }

                const sendPayload = {
                    embeds: [embed]
                };
                if (messageContent.trim()) {
                    sendPayload.content = messageContent;
                }
                if (actionRow) {
                    sendPayload.components = [actionRow];
                }

                const sentMsg = await channel.send(sendPayload).catch(err => {
                    logger.warn(`[Autofeeds] Erreur envoi live channel ${feed.channelId}: ${err.message}`, 'AUTOFEEDS');
                    return null;
                });

                let threadId = null;
                if (sentMsg?.id) {
                    if (feed.createThread && sentMsg.startThread) {
                        try {
                            const threadTitle = `🔴 Live • ${streamerName.slice(0, 30)} - ${(streamItem.title || 'Discussion').slice(0, 50)}`;
                            const thread = await sentMsg.startThread({
                                name: threadTitle,
                                autoArchiveDuration: feed.threadAutoArchiveDuration || 1440,
                                reason: `Fil de discussion pour le direct de ${streamerName}`
                            }).catch(() => null);
                            if (thread) {
                                threadId = thread.id;
                                if (thread.send) {
                                    await thread.send(`👋 Bienvenue dans le fil de discussion pour le live de **${streamerName}** !`).catch(() => {});
                                }
                            }
                        } catch (threadErr) {
                            logger.warn(`[Autofeeds] Impossible de créer le thread live: ${threadErr.message}`, 'AUTOFEEDS');
                        }
                    }

                    await this.repo.saveLiveSession({
                        feedId: feed.id,
                        streamId: streamItem.id,
                        streamerName,
                        channelId: feed.channelId,
                        messageId: sentMsg.id,
                        threadId,
                        title: streamItem.content || streamItem.title,
                        game: gameName,
                        url: streamItem.link,
                        startedAt: streamItem.publishedAt || Date.now()
                    });
                }

                // Notifications DM
                if (dmUserIds.length > 0) {
                    for (const dmUid of dmUserIds) {
                        try {
                            const user = client.users?.fetch ? await client.users.fetch(dmUid).catch(() => null) : null;
                            if (user && user.send) {
                                await user.send({
                                    content: `🔴 **${streamerName}** est en direct !`,
                                    embeds: [embed],
                                    components: actionRow ? [actionRow] : []
                                }).catch(() => {});
                            }
                        } catch {}
                    }
                }

                await this.repo.recordPostedItem(feed.id, streamItem.id, streamItem.link, streamItem.title);
            }
        }
    }

    /**
     * Traite la fin de diffusion (transition offline in-place sans ghost-ping).
     */
    async _handleLiveStreamOffline(feed, client, provider) {
        const activeSession = await this.repo.getActiveLiveSession(feed.id);
        if (!activeSession) {
            return;
        }

        const endedAt = Date.now();
        const durationMs = Math.max(0, endedAt - activeSession.startedAt);
        const totalMinutes = Math.floor(durationMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const durationStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes} min`;

        if (client && client.channels) {
            try {
                const channel = client.channels.cache?.get(activeSession.channelId) 
                    || (client.channels.fetch ? await client.channels.fetch(activeSession.channelId).catch(() => null) : null);
                if (channel && channel.messages) {
                    const originalMsg = channel.messages.fetch ? await channel.messages.fetch(activeSession.messageId).catch(() => null) : null;
                    if (originalMsg && originalMsg.edit) {
                        const offlineEmbed = new EmbedBuilder()
                            .setColor(0x747F8D)
                            .setTitle(`⚫ [OFFLINE] ${activeSession.streamerName} n'est plus en direct`)
                            .setURL(activeSession.url || feed.feedUrl)
                            .setDescription(`Le live est maintenant terminé. Merci d'avoir suivi la diffusion !`)
                            .addFields(
                                { name: '⏱️ Durée du stream', value: `\`${durationStr}\``, inline: true },
                                { name: '🎮 Dernier jeu/catégorie', value: `\`${activeSession.game || 'Non spécifié'}\``, inline: true }
                            )
                            .setFooter({ text: `${provider?.label || 'Stream'} • Diffusion terminée` })
                            .setTimestamp(new Date(endedAt));

                        const offlineRow = new ActionRowBuilder();
                        if (activeSession.url) {
                            offlineRow.addComponents(
                                new ButtonBuilder()
                                    .setLabel('🎬 Voir la chaîne / Replay')
                                    .setEmoji('🎬')
                                    .setStyle(ButtonStyle.Link)
                                    .setURL(activeSession.url)
                            );
                        }

                        // Édition in-place sans ghost-ping (content vidé)
                        await originalMsg.edit({
                            content: ' ',
                            embeds: [offlineEmbed],
                            components: offlineRow.components.length > 0 ? [offlineRow] : []
                        }).catch(err => {
                            logger.warn(`[Autofeeds] Erreur edit message offline: ${err.message}`, 'AUTOFEEDS');
                        });
                    }
                }

                // Clôture du thread live si existant
                if (activeSession.threadId) {
                    const thread = client.channels.cache?.get(activeSession.threadId)
                        || (client.channels.fetch ? await client.channels.fetch(activeSession.threadId).catch(() => null) : null);
                    if (thread && thread.send) {
                        await thread.send(`⚫ Le direct de **${activeSession.streamerName}** est terminé. Merci à tous d'avoir suivi le live !`).catch(() => {});
                        if (thread.setArchived) {
                            await thread.setArchived(true).catch(() => {});
                        }
                    }
                }
            } catch (err) {
                logger.warn(`[Autofeeds] Erreur clôture session message: ${err.message}`, 'AUTOFEEDS');
            }
        }

        await this.repo.closeLiveSession(activeSession.id, {
            endedAt,
            game: activeSession.game,
            title: activeSession.title
        });
        logger.info(`Session live terminée pour ${activeSession.streamerName} (${durationStr})`, 'AUTOFEEDS');
    }

    /**
     * Traite un événement webhook Twitch EventSub (stream.online / stream.offline).
     */
    async handleTwitchEventSub(eventType, eventData, client) {
        const username = (eventData?.broadcaster_user_login || eventData?.broadcaster_user_name || '').toLowerCase();
        if (!username) return { ok: false, error: 'Nom de streamer manquant.' };

        const allFeeds = await this.repo.listAllActive();
        const twitchProv = providerRegistry.get('twitch');
        const matchingFeeds = allFeeds.filter(f => {
            if (f.feedType !== 'twitch') return false;
            return twitchProv.extractUsername(f.feedUrl) === username;
        });

        if (matchingFeeds.length === 0) {
            return { ok: true, matched: 0 };
        }

        for (const feed of matchingFeeds) {
            if (eventType === 'stream.online') {
                const streamItem = {
                    id: `twitch:${username}:${eventData.id || Date.now()}`,
                    title: `🔴 [LIVE] ${eventData.broadcaster_user_name || username} est en direct sur Twitch !`,
                    content: eventData.title || 'Diffusion en direct sur Twitch',
                    link: `https://www.twitch.tv/${username}`,
                    author: eventData.broadcaster_user_name || username,
                    imageUrl: null,
                    publishedAt: eventData.started_at ? new Date(eventData.started_at).getTime() : Date.now(),
                    tags: ['twitch', 'live', 'stream', username],
                    extra: {
                        game: null,
                        viewers: null
                    }
                };
                await this._handleLiveStreamOnline(feed, client || this._client, twitchProv, streamItem);
            } else if (eventType === 'stream.offline') {
                await this._handleLiveStreamOffline(feed, client || this._client, twitchProv);
            }
        }

        return { ok: true, matched: matchingFeeds.length };
    }

    /**
     * Traite une notification WebSub YouTube (nouveau contenu ou live).
     */
    async handleYouTubeWebSub(xmlContent, client) {
        if (!xmlContent || typeof xmlContent !== 'string') {
            return { ok: false, error: 'Corps XML vide' };
        }

        const channelMatch = xmlContent.match(/<yt:channelId>([^<]+)<\/yt:channelId>/i);
        const channelId = channelMatch ? channelMatch[1] : null;

        if (!channelId) {
            return { ok: false, error: 'channelId introuvable dans le payload XML.' };
        }

        const allFeeds = await this.repo.listAllActive();
        const matchingFeeds = allFeeds.filter(f => {
            return (f.feedType === 'youtube' || f.feedType === 'youtube_live') && f.feedUrl.includes(channelId);
        });

        for (const feed of matchingFeeds) {
            await this._checkSingleFeed(feed, client || this._client, true);
        }

        return { ok: true, matched: matchingFeeds.length };
    }

    /**
     * Teste et extrait les éléments d'un flux sans impacter l'historique.
     */
    async testFeed(feedId) {
        const feed = await this.repo.getFeedById(feedId);
        if (!feed) {
            return { ok: false, error: 'Flux introuvable.' };
        }

        const provider = providerRegistry.get(feed.feedType);
        const items = await provider.fetchItems(feed);
        if (!items || items.length === 0) {
            return { ok: false, error: 'Aucun article trouvé sur ce flux.' };
        }

        const latest = items[0];
        const embed = this.buildDiscordEmbed(feed, latest);

        return {
            ok: true,
            data: {
                itemCount: items.length,
                latestItem: latest,
                previewEmbed: embed.toJSON()
            }
        };
    }

    /**
     * Cycle de scrutation de tous les flux actifs.
     */
    async pollFeeds(client) {
        try {
            const feeds = await this.repo.listAllActive();
            for (const feed of feeds) {
                await this._checkSingleFeed(feed, client || this._client);
            }
        } catch (err) {
            logger.warn(`Erreur pollFeeds: ${err.message}`, 'AUTOFEEDS');
        }
    }

    /**
     * Recherche d'articles dans l'historique de la guilde.
     */
    async searchItems(guildId, query, limit = 10) {
        return this.repo.searchHistory(guildId, query, limit);
    }

    /**
     * Récupère les métriques et statistiques d'utilisation des flux pour une guilde.
     */
    async getGuildStats(guildId) {
        return this.repo.getFeedStats(guildId);
    }

    /**
     * Réclame une offre Drop Hunter pour un utilisateur.
     */
    async claimItem(feedId, itemId, userId, guildId, xpAwarded = null) {
        let xp = xpAwarded;
        if (xp === null || xp === undefined) {
            const feed = await this.repo.getFeedById(feedId);
            xp = feed?.gamificationXpReward ?? 25;
        }
        return this.repo.claimItem({ feedId, itemId, userId, guildId, xpAwarded: xp });
    }

    /**
     * Déclenche manuellement ou de manière programmée l'envoi d'un digest.
     */
    async triggerDigest(feedId, client = null) {
        const feed = await this.repo.getFeedById(feedId);
        if (!feed) return false;
        return this.digestService.dispatchDigest(feed, client || this._client);
    }

    /**
     * Vérifie si un article correspond aux critères de Breaking News du flux.
     * @param {Object} feed
     * @param {Object} item
     * @returns {boolean}
     */
    isBreakingItem(feed, item) {
        if (!feed || !item) return false;
        const keywords = Array.isArray(feed.breakingKeywords) ? feed.breakingKeywords : [];
        if (keywords.length === 0) return false;

        const text = `${item.title || ''} ${item.content || item.contentSnippet || ''}`.toLowerCase();
        return keywords.some(k => k && text.includes(String(k).toLowerCase().trim()));
    }

    /**
     * Déclenche manuellement ou périodiquement la purge des messages expirés.
     * @param {Object|string} options
     * @param {Object} [client]
     */
    async purgeExpired(options = {}, client = null) {
        if (this.purgeService) {
            const opts = typeof options === 'string' ? { feedId: options } : { ...options };
            if (client) {
                opts.client = client;
                this.purgeService.setClient(client);
            }
            const stats = await this.purgeService.purgeExpiredMessages(opts);
            return {
                expiredCount: stats.scanned ?? stats.expiredCount ?? 0,
                deletedMessagesCount: stats.purged ?? stats.deletedMessagesCount ?? 0,
                errorsCount: stats.errors ?? 0,
                ...stats
            };
        }
        return { expiredCount: 0, deletedMessagesCount: 0, errorsCount: 0, scanned: 0, purged: 0, errors: 0 };
    }

    /**
     * Génère un briefing audio synthétisé (TTS) pour un flux ou les articles récents de la guilde.
     * @param {string} feedId
     * @param {number|Object} limitOrOptions
     */
    async createAudioBriefing(feedId, limitOrOptions = 5) {
        if (!this.audioService) return null;
        const feed = await this.repo.getFeedById(feedId);
        if (!feed) throw new Error('Flux introuvable');

        const limit = typeof limitOrOptions === 'number' ? limitOrOptions : (limitOrOptions.limit || 5);
        let items = await this.repo.getHistory(feed.id, limit);

        if (!items || items.length === 0) {
            const provider = providerRegistry.get(feed.feedType);
            if (provider) {
                try {
                    items = (await provider.fetchItems(feed)).slice(0, limit);
                } catch {
                    items = [];
                }
            }
        }

        const script = this.audioService.generateBriefingScript(items, { guildName: feed.name });
        const buffer = await this.audioService.synthesizeAudio(script);

        return {
            feedTitle: feed.name || 'Flash Info',
            script,
            buffer,
            audioBuffer: buffer,
            filename: `briefing-${feed.id}-${Date.now()}.mp3`,
            itemCount: items ? items.length : 0,
            mimeType: 'audio/mpeg'
        };
    }

    /**
     * Traite les franchissements de seuils de vote et gère la promotion automatique (Hall of Fame / Best-Of).
     */
    async handleVoteThresholdReached(payload) {
        if (!payload || payload.targetType !== 'autofeed') return;
        const guildId = payload.guildId || 'default';
        const targetId = payload.targetId;
        const stats = payload.stats || { score: 0 };

        try {
            const client = this._client || this.discordClient;
            let feeds = [];
            if (targetId && targetId.includes(':')) {
                const potentialFeedId = targetId.split(':')[0];
                const directFeed = await this.repo.getFeed(potentialFeedId);
                if (directFeed) feeds.push(directFeed);
            }
            if (feeds.length === 0) {
                feeds = (guildId && guildId !== 'default')
                    ? await this.repo.listByGuild(guildId)
                    : await this.repo.listActive();
            }

            for (const feed of feeds) {
                if (!feed.enableVoting || !feed.bestOfChannelId) continue;
                if (stats.score < (feed.bestOfThreshold || 5)) continue;

                const historyItems = await this.repo.getHistory(feed.id, 50);
                const match = historyItems.find(h => 
                    h.id === targetId || 
                    h.link === targetId || 
                    h.title === targetId ||
                    (h.link && targetId.includes(h.link)) ||
                    (h.id && targetId.includes(h.id)) ||
                    (h.url && targetId.includes(h.url)) ||
                    targetId === `${feed.id}:${h.link}` ||
                    targetId === `${feed.id}:${h.url}`
                );
                if (!match || match.isBestOf) continue;

                if (client && client.channels) {
                    const bestOfChan = client.channels.cache?.get(feed.bestOfChannelId)
                        || (client.channels.fetch ? await client.channels.fetch(feed.bestOfChannelId).catch(() => null) : null);

                    if (bestOfChan && bestOfChan.send) {
                        const embed = new EmbedBuilder()
                            .setColor(0xFEE75C)
                            .setTitle(`🏆 [BEST-OF] ${match.title ? (match.title.length > 200 ? match.title.slice(0, 197) + '...' : match.title) : 'COUP DE CŒUR'} (+${stats.score} votes)`)
                            .setDescription(`**[${match.title}](${match.link})**\n\n${match.contentSnippet || ''}`)
                            .addFields(
                                { name: '📊 Votes des membres', value: `👍 **${stats.upvotes}** • 👎 **${stats.downvotes}** (Score: **+${stats.score}**)`, inline: true },
                                { name: '📰 Flux Source', value: `\`${feed.name}\``, inline: true }
                            )
                            .setFooter({ text: 'Élu coup de cœur par la communauté' })
                            .setTimestamp();

                        await bestOfChan.send({ embeds: [embed] }).catch(() => {});
                    }
                }

                await this.repo.updateHistoryBestOf(match.id, true);
                logger.info(`[AutofeedsBestOf] Article "${match.title}" promu dans le Best-Of (${feed.bestOfChannelId}) !`, 'AUTOFEEDS');
                break;
            }
        } catch (err) {
            logger.warn(`[AutofeedsBestOf] Erreur lors de la promotion Best-Of: ${err.message}`, 'AUTOFEEDS');
        }
    }

    /**
     * Extrait le contenu nettoyé d'un article pour le mode lecture épuré (Reader View).
     * @param {string} url
     */
    async getReaderArticle(url) {
        if (!this.readerService) {
            throw new Error('Service de lecture non disponible');
        }
        return this.readerService.extractCleanArticle(url);
    }

    /**
     * Approuve manuellement une actualité en attente de modération et la publie.
     */
    async approvePendingNews(historyId, approvedByUserId, client) {
        const item = await this.repo.getHistoryItemById(historyId);
        if (!item || !item.isPendingApproval) {
            throw new Error("Cette actualité n'est pas ou plus en attente de modération.");
        }
        const feed = await this.repo.getFeedById(item.feedId);
        if (!feed) throw new Error("Flux source introuvable.");

        const targetChannel = client?.channels?.cache?.get(item.channelId || feed.channelId)
            || (client?.channels?.fetch ? await client.channels.fetch(item.channelId || feed.channelId).catch(() => null) : null);
        if (!targetChannel) throw new Error("Salon cible de publication introuvable.");

        const fakeItem = {
            id: item.guid || item.link,
            title: item.title,
            link: item.link,
            content: item.itemContent,
            author: item.itemAuthor,
            tags: item.tags,
            extra: {
                relatedSources: item.relatedSources
            }
        };

        const embed = this.buildDiscordEmbed(feed, fakeItem);
        const rows = this.buildComponentRows(feed, fakeItem, item.id);
        const sentMsg = await targetChannel.send({
            embeds: [embed],
            components: rows
        });

        await this.repo.approvePendingItem(historyId, approvedByUserId, sentMsg.id, targetChannel.id);
        return { ok: true, messageId: sentMsg.id, channelId: targetChannel.id };
    }

    /**
     * Rejette manuellement une actualité en attente de modération.
     */
    async rejectPendingNews(historyId, rejectedByUserId) {
        const item = await this.repo.getHistoryItemById(historyId);
        if (!item || !item.isPendingApproval) {
            throw new Error("Cette actualité n'est pas ou plus en attente de modération.");
        }
        await this.repo.rejectPendingItem(historyId, rejectedByUserId);
        return { ok: true };
    }

    /**
     * Planifie l'heure du briefing matinal en DM pour un membre.
     */
    async setUserDigestSchedule(guildId, userId, scheduleTime = '08:00', isEnabled = true) {
        if (!this.userDigestService) throw new Error('Service User Digest indisponible.');
        return this.userDigestService.setUserSchedule(guildId, userId, scheduleTime, isEnabled);
    }

    /**
     * Récupère la planification du briefing matinal en DM pour un membre.
     */
    async getUserDigestSchedule(guildId, userId) {
        if (!this.userDigestService) throw new Error('Service User Digest indisponible.');
        return this.userDigestService.getUserSchedule(guildId, userId);
    }

    /**
     * Répond à une question posée sur un article via l'IA dédiée.
     */
    async answerArticleQuestion({ url, question, articleTitle = null, articleContent = null }) {
        if (!this.qaService) throw new Error('Service Q&A indisponible.');
        return this.qaService.answerQuestion({ url, question, articleTitle, articleContent });
    }

    /**
     * Synthétise une vidéo YouTube.
     */
    async summarizeYouTubeVideo({ url, videoId = null, title = null, description = null }) {
        if (!this.ytSummaryService) throw new Error('Service YouTube Summary indisponible.');
        return this.ytSummaryService.summarizeVideo({ url, videoId, title, description });
    }

    start(client) {
        this._client = client;
        if (this.purgeService && typeof this.purgeService.setClient === 'function') {
            this.purgeService.setClient(client);
        }
        if (this._intervalTimer) return;
        this._intervalTimer = setInterval(() => {
            this.pollFeeds(client).catch(() => {});
            this.userDigestService?.processDueDigests(client).catch(() => {});
        }, 60 * 1000); // Scrutation par minute avec contrôle des intervalles individuels
    }

    stop() {
        if (this._intervalTimer) {
            clearInterval(this._intervalTimer);
            this._intervalTimer = null;
        }
    }
}

Injectable()(AutofeedsService);

module.exports = { AutofeedsService };
