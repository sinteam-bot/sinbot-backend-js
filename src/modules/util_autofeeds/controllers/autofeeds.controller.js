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
}

Controller('/api/autofeeds')(AutofeedsController);
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

