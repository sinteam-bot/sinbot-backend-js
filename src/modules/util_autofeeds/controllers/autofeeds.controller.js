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
}

Controller('/api/autofeeds')(AutofeedsController);
Get('/presets')(AutofeedsController.prototype, 'getPresets');
Post('/presets/install')(AutofeedsController.prototype, 'installPreset');
Get('/providers')(AutofeedsController.prototype, 'getProviders');
Get('/subscriptions')(AutofeedsController.prototype, 'listSubscriptions');
Post('/subscriptions')(AutofeedsController.prototype, 'createSubscription');
Delete('/subscriptions/:id')(AutofeedsController.prototype, 'deleteSubscription');
Get('')(AutofeedsController.prototype, 'list');
Post('')(AutofeedsController.prototype, 'create');
Get('/:id')(AutofeedsController.prototype, 'getById');
Patch('/:id')(AutofeedsController.prototype, 'update');
Delete('/:id')(AutofeedsController.prototype, 'deleteFeed');
Post('/:id/test')(AutofeedsController.prototype, 'testFeed');

module.exports = { AutofeedsController };
