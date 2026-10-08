/**
 * src/modules/util_autofeeds/controllers/autofeeds.controller.js
 *
 * Contrôleur REST pour les flux automatiques (Autofeeds), presets, souscriptions et providers.
 */

const { Controller, Get, Post, Patch, Delete } = require('../../../core/index.js');
const { AutofeedsService } = require('../services/autofeeds.service.js');
const { AutofeedsSubscriptionService } = require('../services/autofeeds-subscription.service.js');
const { providerRegistry } = require('../services/providers/provider-registry.js');
const { PRESETS } = require('../config/presets.js');

class AutofeedsController {
    static inject = [AutofeedsService, AutofeedsSubscriptionService];

    constructor(service, subService) {
        this.service = service;
        this.subService = subService;
    }

    /**
     * GET /api/autofeeds
     */
    async list(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const list = await this.service.listFeeds(guildId);
            return { success: true, ok: true, data: list };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * POST /api/autofeeds
     */
    async create(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const {
                channel_id,
                channelId,
                feed_url,
                feedUrl,
                url,
                name,
                feed_type,
                feedType,
                provider,
                category,
                tags,
                filters,
                filter_keywords,
                filterKeywords,
                include_keywords,
                includeKeywords,
                exclude_keywords,
                excludeKeywords,
                regex_filter,
                regexFilter,
                custom_message,
                customMessage,
                color,
                embed_color,
                embedColor,
                ping_role_id,
                pingRoleId,
                interval_minutes,
                intervalMinutes,
                check_interval_minutes,
                checkIntervalMinutes,
                enabled,
                is_active,
                isActive
            } = req.body || {};

            let finalFilters = filters && typeof filters === 'object' ? { ...filters } : {};
            const inc = includeKeywords || include_keywords || filterKeywords || filter_keywords;
            if (inc) finalFilters.includeKeywords = Array.isArray(inc) ? inc : [inc];
            const exc = excludeKeywords || exclude_keywords;
            if (exc) finalFilters.excludeKeywords = Array.isArray(exc) ? exc : [exc];
            const reg = regexFilter || regex_filter;
            if (reg) finalFilters.regexFilter = reg;

            const res = await this.service.addFeed({
                guildId,
                channelId: channelId || channel_id,
                feedUrl: feedUrl || feed_url || url,
                name,
                feedType: feedType || feed_type || provider,
                category,
                tags,
                filters: finalFilters,
                customMessage: customMessage || custom_message,
                color: color || embedColor || embed_color,
                pingRoleId: pingRoleId || ping_role_id,
                subscriberRoleId: req.body?.subscriber_role_id || req.body?.subscriberRoleId,
                notificationDelivery: req.body?.notification_delivery || req.body?.notificationDelivery || 'channel',
                createThread: req.body?.create_thread !== undefined ? Boolean(req.body.create_thread) : Boolean(req.body?.createThread),
                threadAutoArchiveDuration: req.body?.thread_auto_archive_duration || req.body?.threadAutoArchiveDuration || 1440,
                useWebhook: req.body?.use_webhook !== undefined ? Boolean(req.body.use_webhook) : (req.body?.useWebhook !== undefined ? Boolean(req.body.useWebhook) : true),
                enableMediaProxy: req.body?.enable_media_proxy !== undefined ? Boolean(req.body.enable_media_proxy) : (req.body?.enableMediaProxy !== undefined ? Boolean(req.body.enableMediaProxy) : true),
                ignoreShorts: req.body?.ignore_shorts !== undefined ? Boolean(req.body.ignore_shorts) : Boolean(req.body?.ignoreShorts),
                aiSummary: req.body?.ai_summary !== undefined ? Boolean(req.body.ai_summary) : Boolean(req.body?.aiSummary),
                aiTranslate: req.body?.ai_translate !== undefined ? req.body.ai_translate : (req.body?.aiTranslate || null),
                digestMode: req.body?.digest_mode || req.body?.digestMode || 'realtime',
                digestSchedule: req.body?.digest_schedule || req.body?.digestSchedule || '08:00',
                digestChannelId: req.body?.digest_channel_id || req.body?.digestChannelId || null,
                enableGamification: req.body?.enable_gamification !== undefined ? Boolean(req.body.enable_gamification) : Boolean(req.body?.enableGamification),
                gamificationXpReward: req.body?.gamification_xp_reward || req.body?.gamificationXpReward || 25,
                channelTagRouting: req.body?.channel_tag_routing || req.body?.channelTagRouting || {},
                quietHours: req.body?.quiet_hours || req.body?.quietHours || {},
                maxPostsPerHour: req.body?.max_posts_per_hour || req.body?.maxPostsPerHour || 0,
                autoReactions: req.body?.auto_reactions || req.body?.autoReactions || [],
                autoPoll: req.body?.auto_poll || req.body?.autoPoll || {},
                breakingKeywords: req.body?.breaking_keywords || req.body?.breakingKeywords || [],
                bypassQuietHours: req.body?.bypass_quiet_hours !== undefined ? Boolean(req.body.bypass_quiet_hours) : Boolean(req.body?.bypassQuietHours),
                breakingRoleId: req.body?.breaking_role_id || req.body?.breakingRoleId || null,
                autoExpireDays: req.body?.auto_expire_days !== undefined ? Number(req.body.auto_expire_days) : (req.body?.autoExpireDays !== undefined ? Number(req.body.autoExpireDays) : 0),
                enableAudioBriefing: req.body?.enable_audio_briefing !== undefined ? Boolean(req.body.enable_audio_briefing) : Boolean(req.body?.enableAudioBriefing),
                enableVoting: req.body?.enable_voting !== undefined ? Boolean(req.body.enable_voting) : Boolean(req.body?.enableVoting),
                bestOfThreshold: req.body?.best_of_threshold !== undefined ? Number(req.body.best_of_threshold) : (req.body?.bestOfThreshold !== undefined ? Number(req.body.bestOfThreshold) : 5),
                bestOfChannelId: req.body?.best_of_channel_id || req.body?.bestOfChannelId || null,
                minDiscountPercent: req.body?.min_discount_percent !== undefined ? Number(req.body.min_discount_percent) : (req.body?.minDiscountPercent !== undefined ? Number(req.body.minDiscountPercent) : 0),
                autoSyncEvents: req.body?.auto_sync_events !== undefined ? Boolean(req.body.auto_sync_events) : Boolean(req.body?.autoSyncEvents),
                goodVibesOnly: req.body?.good_vibes_only !== undefined ? Boolean(req.body.good_vibes_only) : Boolean(req.body?.goodVibesOnly),
                enableSecurityScan: req.body?.enable_security_scan !== undefined ? Boolean(req.body.enable_security_scan) : (req.body?.enableSecurityScan !== undefined ? Boolean(req.body.enableSecurityScan) : true),
                translateTitleToFr: req.body?.translate_title_to_fr !== undefined ? Boolean(req.body.translate_title_to_fr) : Boolean(req.body?.translateTitleToFr),
                antiClickbait: req.body?.anti_clickbait !== undefined ? Boolean(req.body.anti_clickbait) : Boolean(req.body?.antiClickbait),
                requireApproval: req.body?.require_approval !== undefined ? Boolean(req.body.require_approval) : Boolean(req.body?.requireApproval),
                moderationChannelId: req.body?.moderation_channel_id || req.body?.moderationChannelId || null,
                enableStoryClustering: req.body?.enable_story_clustering !== undefined ? Boolean(req.body.enable_story_clustering) : Boolean(req.body?.enableStoryClustering),
                clusterMode: req.body?.cluster_mode || req.body?.clusterMode || 'merge',
                enableVideoSummary: req.body?.enable_video_summary !== undefined ? Boolean(req.body.enable_video_summary) : Boolean(req.body?.enableVideoSummary),
                intervalMinutes: intervalMinutes || interval_minutes || checkIntervalMinutes || check_interval_minutes,
                enabled: enabled !== undefined ? Boolean(enabled) : (isActive !== undefined ? Boolean(isActive) : (is_active !== undefined ? Boolean(is_active) : true))
            });

            if (!res.ok) {
                return { success: false, ok: false, error: res.error };
            }

            return { success: true, ok: true, data: res.data };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * GET /api/autofeeds/presets
     */
    async getPresets(req) {
        return { success: true, ok: true, data: PRESETS };
    }

    /**
     * POST /api/autofeeds/presets/install
     */
    async installPreset(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const {
                channel_id,
                channelId,
                preset_id,
                presetId,
                interval_minutes,
                intervalMinutes,
                check_interval_minutes,
                checkIntervalMinutes
            } = req.body || {};

            const res = await this.service.installPreset(
                guildId,
                channelId || channel_id,
                presetId || preset_id,
                { intervalMinutes: intervalMinutes || interval_minutes || checkIntervalMinutes || check_interval_minutes }
            );

            if (!res.ok) {
                return { success: false, ok: false, error: res.error };
            }

            return { success: true, ok: true, data: res.data };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * GET /api/autofeeds/providers
     */
    async getProviders(req) {
        return { success: true, ok: true, data: providerRegistry.list() };
    }

    /**
     * GET /api/autofeeds/subscriptions
     */
    async listSubscriptions(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.query?.user_id;

            let subs = [];
            if (userId) {
                subs = await this.subService.listUserSubscriptions(guildId, userId);
            } else {
                subs = await this.subService.listGuildSubscriptions(guildId);
            }

            return { success: true, ok: true, data: subs };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * POST /api/autofeeds/subscriptions
     */
    async createSubscription(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const {
                user_id,
                userId,
                target_type,
                targetType,
                target_value,
                targetValue,
                notify_mode,
                notifyMode,
                filters
            } = req.body || {};

            const res = await this.subService.subscribe({
                guildId,
                userId: userId || user_id,
                targetType: targetType || target_type,
                targetValue: targetValue || target_value,
                notifyMode: notifyMode || notify_mode,
                filters: filters || {}
            });

            if (!res.ok) {
                return { success: false, ok: false, error: res.error };
            }

            return { success: true, ok: true, data: res.data };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * DELETE /api/autofeeds/subscriptions/:id
     */
    async deleteSubscription(req) {
        try {
            const res = await this.subService.unsubscribeById(req.params?.id);
            return { success: true, ok: true, deleted: res?.deleted ?? true };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * GET /api/autofeeds/:id
     */
    async getById(req) {
        try {
            const feed = await this.service.getFeed(req.params?.id);
            if (!feed) return { success: false, ok: false, error: 'Flux introuvable.' };
            return { success: true, ok: true, data: feed };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * PATCH /api/autofeeds/:id
     */
    async update(req) {
        try {
            const patch = req.body || {};
            let finalFilters = patch.filters;
            if (patch.filterKeywords || patch.filter_keywords || patch.includeKeywords || patch.include_keywords || patch.excludeKeywords || patch.exclude_keywords || patch.regexFilter || patch.regex_filter) {
                finalFilters = finalFilters && typeof finalFilters === 'object' ? { ...finalFilters } : {};
                const inc = patch.includeKeywords || patch.include_keywords || patch.filterKeywords || patch.filter_keywords;
                if (inc) finalFilters.includeKeywords = Array.isArray(inc) ? inc : [inc];
                const exc = patch.excludeKeywords || patch.exclude_keywords;
                if (exc) finalFilters.excludeKeywords = Array.isArray(exc) ? exc : [exc];
                const reg = patch.regexFilter || patch.regex_filter;
                if (reg) finalFilters.regexFilter = reg;
            }

            const updated = await this.service.updateFeed(req.params?.id, {
                channelId: patch.channel_id || patch.channelId,
                feedUrl: patch.feed_url || patch.feedUrl || patch.url,
                name: patch.name,
                feedType: patch.feed_type || patch.feedType || patch.provider,
                category: patch.category,
                tags: patch.tags,
                filters: finalFilters,
                customMessage: patch.custom_message || patch.customMessage,
                color: patch.color || patch.embedColor || patch.embed_color,
                pingRoleId: patch.ping_role_id || patch.pingRoleId,
                subscriberRoleId: patch.subscriber_role_id !== undefined ? patch.subscriber_role_id : patch.subscriberRoleId,
                notificationDelivery: patch.notification_delivery !== undefined ? patch.notification_delivery : patch.notificationDelivery,
                createThread: patch.create_thread !== undefined ? Boolean(patch.create_thread) : (patch.createThread !== undefined ? Boolean(patch.createThread) : undefined),
                threadAutoArchiveDuration: patch.thread_auto_archive_duration !== undefined ? Number(patch.thread_auto_archive_duration) : patch.threadAutoArchiveDuration,
                useWebhook: patch.use_webhook !== undefined ? Boolean(patch.use_webhook) : (patch.useWebhook !== undefined ? Boolean(patch.useWebhook) : undefined),
                enableMediaProxy: patch.enable_media_proxy !== undefined ? Boolean(patch.enable_media_proxy) : (patch.enableMediaProxy !== undefined ? Boolean(patch.enableMediaProxy) : undefined),
                ignoreShorts: patch.ignore_shorts !== undefined ? Boolean(patch.ignore_shorts) : (patch.ignoreShorts !== undefined ? Boolean(patch.ignoreShorts) : undefined),
                aiSummary: patch.ai_summary !== undefined ? Boolean(patch.ai_summary) : (patch.aiSummary !== undefined ? Boolean(patch.aiSummary) : undefined),
                aiTranslate: patch.ai_translate !== undefined ? patch.ai_translate : patch.aiTranslate,
                digestMode: patch.digest_mode !== undefined ? patch.digest_mode : patch.digestMode,
                digestSchedule: patch.digest_schedule !== undefined ? patch.digest_schedule : patch.digestSchedule,
                digestChannelId: patch.digest_channel_id !== undefined ? patch.digest_channel_id : patch.digestChannelId,
                enableGamification: patch.enable_gamification !== undefined ? Boolean(patch.enable_gamification) : (patch.enableGamification !== undefined ? Boolean(patch.enableGamification) : undefined),
                gamificationXpReward: patch.gamification_xp_reward !== undefined ? Number(patch.gamification_xp_reward) : patch.gamificationXpReward,
                channelTagRouting: patch.channel_tag_routing !== undefined ? patch.channel_tag_routing : patch.channelTagRouting,
                quietHours: patch.quiet_hours !== undefined ? patch.quiet_hours : patch.quietHours,
                maxPostsPerHour: patch.max_posts_per_hour !== undefined ? Number(patch.max_posts_per_hour) : patch.maxPostsPerHour,
                autoReactions: patch.auto_reactions !== undefined ? patch.auto_reactions : patch.autoReactions,
                autoPoll: patch.auto_poll !== undefined ? patch.auto_poll : patch.autoPoll,
                breakingKeywords: patch.breaking_keywords !== undefined ? patch.breaking_keywords : patch.breakingKeywords,
                bypassQuietHours: patch.bypass_quiet_hours !== undefined ? Boolean(patch.bypass_quiet_hours) : (patch.bypassQuietHours !== undefined ? Boolean(patch.bypassQuietHours) : undefined),
                breakingRoleId: patch.breaking_role_id !== undefined ? patch.breaking_role_id : patch.breakingRoleId,
                autoExpireDays: patch.auto_expire_days !== undefined ? Number(patch.auto_expire_days) : (patch.autoExpireDays !== undefined ? Number(patch.autoExpireDays) : undefined),
                enableAudioBriefing: patch.enable_audio_briefing !== undefined ? Boolean(patch.enable_audio_briefing) : (patch.enableAudioBriefing !== undefined ? Boolean(patch.enableAudioBriefing) : undefined),
                enableVoting: patch.enable_voting !== undefined ? Boolean(patch.enable_voting) : (patch.enableVoting !== undefined ? Boolean(patch.enableVoting) : undefined),
                bestOfThreshold: patch.best_of_threshold !== undefined ? Number(patch.best_of_threshold) : (patch.bestOfThreshold !== undefined ? Number(patch.bestOfThreshold) : undefined),
                bestOfChannelId: patch.best_of_channel_id !== undefined ? patch.best_of_channel_id : patch.bestOfChannelId,
                minDiscountPercent: patch.min_discount_percent !== undefined ? Number(patch.min_discount_percent) : (patch.minDiscountPercent !== undefined ? Number(patch.minDiscountPercent) : undefined),
                autoSyncEvents: patch.auto_sync_events !== undefined ? Boolean(patch.auto_sync_events) : (patch.autoSyncEvents !== undefined ? Boolean(patch.autoSyncEvents) : undefined),
                goodVibesOnly: patch.good_vibes_only !== undefined ? Boolean(patch.good_vibes_only) : (patch.goodVibesOnly !== undefined ? Boolean(patch.goodVibesOnly) : undefined),
                enableSecurityScan: patch.enable_security_scan !== undefined ? Boolean(patch.enable_security_scan) : (patch.enableSecurityScan !== undefined ? Boolean(patch.enableSecurityScan) : undefined),
                translateTitleToFr: patch.translate_title_to_fr !== undefined ? Boolean(patch.translate_title_to_fr) : (patch.translateTitleToFr !== undefined ? Boolean(patch.translateTitleToFr) : undefined),
                antiClickbait: patch.anti_clickbait !== undefined ? Boolean(patch.anti_clickbait) : (patch.antiClickbait !== undefined ? Boolean(patch.antiClickbait) : undefined),
                requireApproval: patch.require_approval !== undefined ? Boolean(patch.require_approval) : (patch.requireApproval !== undefined ? Boolean(patch.requireApproval) : undefined),
                moderationChannelId: patch.moderation_channel_id !== undefined ? patch.moderation_channel_id : patch.moderationChannelId,
                enableStoryClustering: patch.enable_story_clustering !== undefined ? Boolean(patch.enable_story_clustering) : (patch.enableStoryClustering !== undefined ? Boolean(patch.enableStoryClustering) : undefined),
                clusterMode: patch.cluster_mode || patch.clusterMode,
                enableVideoSummary: patch.enable_video_summary !== undefined ? Boolean(patch.enable_video_summary) : (patch.enableVideoSummary !== undefined ? Boolean(patch.enableVideoSummary) : undefined),
                intervalMinutes: patch.interval_minutes || patch.intervalMinutes || patch.check_interval_minutes || patch.checkIntervalMinutes,
                enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : (patch.isActive !== undefined ? Boolean(patch.isActive) : (patch.is_active !== undefined ? Boolean(patch.is_active) : undefined))
            });

            return { success: true, ok: true, data: updated };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * DELETE /api/autofeeds/:id
     */
    async deleteFeed(req) {
        try {
            await this.service.deleteFeed(req.params?.id);
            return { success: true, ok: true, deleted: true };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * POST /api/autofeeds/:id/test
     */
    async testFeed(req) {
        try {
            const res = await this.service.testFeed(req.params?.id);
            if (!res.ok) {
                return { success: false, ok: false, error: res.error };
            }
            return { success: true, ok: true, data: res.data };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * POST /api/autofeeds/webhooks/twitch
     * Twitch EventSub Webhook Handler
     */
    async handleTwitchWebhook(req, res) {
        try {
            const messageType = req.headers?.['twitch-eventsub-message-type'] || req.headers?.['Twitch-Eventsub-Message-Type'];
            const body = req.body || {};

            // 1. Validation du challenge Twitch EventSub
            if (messageType === 'webhook_callback_verification' || body.challenge) {
                if (res && typeof res.status === 'function') {
                    const chain = res.status(200);
                    if (chain && typeof chain.send === 'function') {
                        return chain.send(body.challenge);
                    } else if (typeof res.send === 'function') {
                        return res.send(body.challenge);
                    }
                }
                return body.challenge;
            }

            // 2. Réception d'une notification (stream.online / stream.offline)
            if (messageType === 'notification' || body.subscription) {
                const subType = body.subscription?.type;
                const event = body.event || {};
                await this.service.handleTwitchEventSub(subType, event);
                return { success: true, ok: true, handled: true, event: subType };
            }

            return { success: true, ok: true, received: true };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * GET /api/autofeeds/webhooks/youtube
     * YouTube WebSub Hub Challenge Verification
     */
    async handleYouTubeChallenge(req, res) {
        try {
            const challenge = req.query?.['hub.challenge'] || req.query?.challenge;
            if (challenge) {
                if (res && typeof res.status === 'function') {
                    const chain = res.status(200);
                    if (chain && typeof chain.send === 'function') {
                        return chain.send(challenge);
                    } else if (typeof res.send === 'function') {
                        return res.send(challenge);
                    }
                }
                return challenge;
            }
            return { success: true, ok: true };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * POST /api/autofeeds/opml/import
     */
    async importOpml(req, res) {
        try {
            const guildId = req.body?.guild_id || req.body?.guildId || process.env.GUILD_ID || 'default';
            const channelId = req.body?.channel_id || req.body?.channelId;
            const opmlXml = req.body?.opmlXml || req.body?.opml || req.body?.xml || (typeof req.body === 'string' ? req.body : null);

            if (!channelId || !opmlXml) {
                const errResult = { success: false, ok: false, error: 'Salon Discord (channel_id) et contenu OPML requis.' };
                if (res && typeof res.json === 'function') return res.json(errResult);
                return errResult;
            }

            const importRes = await this.service.importOpml(guildId, channelId, opmlXml);
            const okResult = { success: true, ok: true, data: importRes };
            if (res && typeof res.json === 'function') return res.json(okResult);
            return okResult;
        } catch (err) {
            const errResult = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') return res.json(errResult);
            return errResult;
        }
    }

    /**
     * GET /api/autofeeds/opml/export
     */
    async exportOpml(req, res) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const xml = await this.service.exportOpml(guildId);
            if (res && typeof res.setHeader === 'function') {
                res.setHeader('Content-Type', 'text/xml');
                res.setHeader('Content-Disposition', 'attachment; filename="autofeeds.opml"');
                return res.send ? res.send(xml) : xml;
            }
            return { success: true, ok: true, data: { xml } };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * POST /api/autofeeds/webhooks/youtube
     * YouTube WebSub Notification Ingestion
     */
    async handleYouTubeNotification(req, res) {
        try {
            const xmlBody = typeof req.body === 'string' ? req.body : (req.rawBody || JSON.stringify(req.body));
            await this.service.handleYouTubeWebSub(xmlBody);
            return { success: true, ok: true, received: true };
        } catch (err) {
            return { success: false, ok: false, error: err.message };
        }
    }

    /**
     * GET /api/autofeeds/stats
     */
    async getStats(req, res = null) {
        try {
            const guildId = req.params?.guildId || req.params?.guild_id || req.query?.guild_id || req.query?.guildId || process.env.GUILD_ID || 'default';
            const stats = await this.service.getGuildStats(guildId);
            const result = { success: true, ok: true, data: stats };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        }
    }

    /**
     * GET /api/autofeeds/search
     */
    async searchItems(req, res = null) {
        try {
            const guildId = req.params?.guildId || req.params?.guild_id || req.query?.guild_id || req.query?.guildId || process.env.GUILD_ID || 'default';
            const query = req.query?.q || req.query?.query || '';
            const limit = req.query?.limit || 10;
            const results = await this.service.searchItems(guildId, query, limit);
            const result = { success: true, ok: true, data: results };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        }
    }

    /**
     * POST /api/autofeeds/claims
     */
    async claimItem(req, res = null) {
        try {
            const { feedId, feed_id, itemId, item_id, userId, user_id, guildId, guild_id, xpAwarded, xp_awarded } = req.body || {};
            const claimRes = await this.service.claimItem(
                feedId || feed_id,
                itemId || item_id,
                userId || user_id,
                guildId || guild_id || req.params?.guildId || 'default',
                xpAwarded || xp_awarded || 25
            );
            const result = { success: true, ok: true, data: claimRes };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        }
    }
    /**
     * POST /api/autofeeds/purge
     * Cleans up expired feed items and Discord messages
     */
    async purge(req, res = null) {
        try {
            const feedId = req.body?.feedId || req.body?.feed_id || req.query?.feed_id || null;
            const purgeRes = await this.service.purgeExpired(feedId);
            const result = { success: true, ok: true, data: purgeRes };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        }
    }

    /**
     * GET /api/autofeeds/:id/audio
     * Generates TTS radio briefing for a feed
     */
    async getAudioBriefing(req, res = null) {
        try {
            const id = req.params?.id;
            const limit = parseInt(req.query?.limit || '5', 10);
            const briefing = await this.service.createAudioBriefing(id, limit);
            if (req.query?.download === 'true' && res && typeof res.setHeader === 'function') {
                res.setHeader('Content-Type', briefing.mimeType || 'audio/mpeg');
                res.setHeader('Content-Disposition', `attachment; filename="${briefing.filename}"`);
                return res.send ? res.send(briefing.buffer) : briefing.buffer;
            }
            const result = {
                success: true,
                ok: true,
                data: {
                    feedTitle: briefing.feedTitle,
                    script: briefing.script,
                    itemCount: briefing.itemCount,
                    filename: briefing.filename,
                    sizeBytes: briefing.buffer ? briefing.buffer.length : 0
                }
            };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') {
                res.json(result);
            }
            return result;
        }
    }

    /**
     * GET /api/autofeeds/reader?url=...
     */
    async getReaderArticle(req, res) {
        try {
            const url = req.query?.url;
            if (!url) {
                const result = { success: false, ok: false, error: 'url parameter is required' };
                if (res && typeof res.json === 'function') res.json(result);
                return result;
            }
            const article = await this.service.getReaderArticle(url);
            const result = { success: true, ok: true, data: article };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        }
    }

    /**
     * GET /api/autofeeds/votes?targetType=autofeed&targetId=...
     */
    async getVotes(req, res) {
        try {
            const targetType = req.query?.targetType || 'autofeed';
            const targetId = req.query?.targetId || req.query?.id;
            if (!targetId) {
                const result = { success: false, ok: false, error: 'targetId parameter is required' };
                if (res && typeof res.json === 'function') res.json(result);
                return result;
            }
            const stats = await this.service.votingService.getStats(targetType, targetId);
            const result = { success: true, ok: true, data: stats };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        }
    }

    /**
     * GET /api/autofeeds/user-digest
     */
    async getUserDigest(req, res) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.query?.user_id || req.user?.id;
            if (!userId) {
                const result = { success: false, ok: false, error: 'user_id parameter is required' };
                if (res && typeof res.json === 'function') res.json(result);
                return result;
            }
            const data = await this.service.getUserDigestSchedule(guildId, userId);
            const result = { success: true, ok: true, data };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        }
    }

    /**
     * POST /api/autofeeds/user-digest
     */
    async setUserDigest(req, res) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const userId = req.body?.user_id || req.user?.id;
            const scheduleTime = req.body?.schedule_time || req.body?.scheduleTime || '08:00';
            const isEnabled = req.body?.is_enabled !== undefined ? Boolean(req.body.is_enabled) : (req.body?.isEnabled !== undefined ? Boolean(req.body.isEnabled) : true);

            if (!userId) {
                const result = { success: false, ok: false, error: 'user_id is required' };
                if (res && typeof res.json === 'function') res.json(result);
                return result;
            }

            const data = await this.service.setUserDigestSchedule(guildId, userId, scheduleTime, isEnabled);
            const result = { success: true, ok: true, data };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        }
    }

    /**
     * POST /api/autofeeds/qa
     */
    async answerQuestion(req, res) {
        try {
            const { url, question, title, content } = req.body || {};
            if (!question) {
                const result = { success: false, ok: false, error: 'question parameter is required' };
                if (res && typeof res.json === 'function') res.json(result);
                return result;
            }

            const data = await this.service.answerArticleQuestion({
                url,
                question,
                articleTitle: title,
                articleContent: content
            });
            const result = { success: true, ok: true, data };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        }
    }

    /**
     * POST /api/autofeeds/video-summary
     */
    async summarizeVideo(req, res) {
        try {
            const { url, videoId, title, description } = req.body || {};
            if (!url && !videoId) {
                const result = { success: false, ok: false, error: 'url or videoId is required' };
                if (res && typeof res.json === 'function') res.json(result);
                return result;
            }

            const data = await this.service.summarizeYouTubeVideo({ url, videoId, title, description });
            const result = { success: true, ok: true, data };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        }
    }

    /**
     * GET /api/autofeeds/moderation/pending
     */
    async listPendingModeration(req, res) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const data = await this.service.repo.getPendingApprovals(guildId);
            const result = { success: true, ok: true, data };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        }
    }

    /**
     * POST /api/autofeeds/moderation/:id/approve
     */
    async approvePending(req, res) {
        try {
            const id = parseInt(req.params?.id, 10);
            const userId = req.body?.user_id || req.user?.id || 'admin';
            const data = await this.service.approvePendingNews(id, userId, this.service._client);
            const result = { success: true, ok: true, data };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        }
    }

    /**
     * POST /api/autofeeds/moderation/:id/reject
     */
    async rejectPending(req, res) {
        try {
            const id = parseInt(req.params?.id, 10);
            const userId = req.body?.user_id || req.user?.id || 'admin';
            const data = await this.service.rejectPendingNews(id, userId);
            const result = { success: true, ok: true, data };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        } catch (err) {
            const result = { success: false, ok: false, error: err.message };
            if (res && typeof res.json === 'function') res.json(result);
            return result;
        }
    }
}

Controller('/api/autofeeds')(AutofeedsController);
Get('/stats')(AutofeedsController.prototype, 'getStats');
Get('/search')(AutofeedsController.prototype, 'searchItems');
Get('/reader')(AutofeedsController.prototype, 'getReaderArticle');
Get('/votes')(AutofeedsController.prototype, 'getVotes');
Get('/user-digest')(AutofeedsController.prototype, 'getUserDigest');
Post('/user-digest')(AutofeedsController.prototype, 'setUserDigest');
Post('/qa')(AutofeedsController.prototype, 'answerQuestion');
Post('/video-summary')(AutofeedsController.prototype, 'summarizeVideo');
Get('/moderation/pending')(AutofeedsController.prototype, 'listPendingModeration');
Post('/moderation/:id/approve')(AutofeedsController.prototype, 'approvePending');
Post('/moderation/:id/reject')(AutofeedsController.prototype, 'rejectPending');
Post('/claims')(AutofeedsController.prototype, 'claimItem');
Post('/purge')(AutofeedsController.prototype, 'purge');
Get('/presets')(AutofeedsController.prototype, 'getPresets');
Post('/presets/install')(AutofeedsController.prototype, 'installPreset');
Get('/providers')(AutofeedsController.prototype, 'getProviders');
Get('/subscriptions')(AutofeedsController.prototype, 'listSubscriptions');
Post('/subscriptions')(AutofeedsController.prototype, 'createSubscription');
Delete('/subscriptions/:id')(AutofeedsController.prototype, 'deleteSubscription');
Post('/opml/import')(AutofeedsController.prototype, 'importOpml');
Get('/opml/export')(AutofeedsController.prototype, 'exportOpml');
Get('')(AutofeedsController.prototype, 'list');
Post('')(AutofeedsController.prototype, 'create');
Get('/:id')(AutofeedsController.prototype, 'getById');
Get('/:id/audio')(AutofeedsController.prototype, 'getAudioBriefing');
Patch('/:id')(AutofeedsController.prototype, 'update');
Delete('/:id')(AutofeedsController.prototype, 'deleteFeed');
Post('/:id/test')(AutofeedsController.prototype, 'testFeed');
Post('/webhooks/twitch')(AutofeedsController.prototype, 'handleTwitchWebhook');
Get('/webhooks/youtube')(AutofeedsController.prototype, 'handleYouTubeChallenge');
Post('/webhooks/youtube')(AutofeedsController.prototype, 'handleYouTubeNotification');

class AutofeedsWebhooksController {
    static inject = [AutofeedsService];

    constructor(service) {
        this.service = service;
        this.baseController = new AutofeedsController(service);
    }

    async handleTwitchWebhook(req, res) {
        return this.baseController.handleTwitchWebhook(req, res);
    }

    async handleYouTubeChallenge(req, res) {
        return this.baseController.handleYouTubeChallenge(req, res);
    }

    async handleYouTubeNotification(req, res) {
        return this.baseController.handleYouTubeNotification(req, res);
    }
}

Controller('/api/webhooks')(AutofeedsWebhooksController);
Post('/twitch')(AutofeedsWebhooksController.prototype, 'handleTwitchWebhook');
Get('/youtube')(AutofeedsWebhooksController.prototype, 'handleYouTubeChallenge');
Post('/youtube')(AutofeedsWebhooksController.prototype, 'handleYouTubeNotification');

module.exports = { AutofeedsController, AutofeedsWebhooksController };

