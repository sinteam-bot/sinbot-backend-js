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
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
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
                name,
                feed_type,
                feedType,
                category,
                tags,
                filters,
                custom_message,
                customMessage,
                color,
                ping_role_id,
                pingRoleId,
                interval_minutes,
                intervalMinutes
            } = req.body || {};

            return await this.service.addFeed({
                guildId,
                channelId: channelId || channel_id,
                feedUrl: feedUrl || feed_url,
                name,
                feedType: feedType || feed_type,
                category,
                tags,
                filters,
                customMessage: customMessage || custom_message,
                color,
                pingRoleId: pingRoleId || ping_role_id,
                intervalMinutes: intervalMinutes || interval_minutes
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * GET /api/autofeeds/presets
     */
    async getPresets(req) {
        return { success: true, data: PRESETS };
    }

    /**
     * POST /api/autofeeds/presets/install
     */
    async installPreset(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const { channel_id, channelId, preset_id, presetId, interval_minutes, intervalMinutes } = req.body || {};
            return await this.service.installPreset(
                guildId,
                channelId || channel_id,
                presetId || preset_id,
                { intervalMinutes: intervalMinutes || interval_minutes }
            );
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * GET /api/autofeeds/providers
     */
    async getProviders(req) {
        return { success: true, data: providerRegistry.list() };
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

            return { success: true, data: subs };
        } catch (err) {
            return { success: false, error: err.message };
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
                notifyMode
            } = req.body || {};

            return await this.subService.subscribe({
                guildId,
                userId: userId || user_id,
                targetType: targetType || target_type,
                targetValue: targetValue || target_value,
                notifyMode: notifyMode || notify_mode
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * DELETE /api/autofeeds/subscriptions/:id
     */
    async deleteSubscription(req) {
        try {
            return await this.subService.unsubscribeById(req.params?.id);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * GET /api/autofeeds/:id
     */
    async getById(req) {
        try {
            const feed = await this.service.getFeed(req.params?.id);
            if (!feed) return { success: false, error: 'Flux introuvable.' };
            return { success: true, data: feed };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * PATCH /api/autofeeds/:id
     */
    async update(req) {
        try {
            const patch = req.body || {};
            return await this.service.updateFeed(req.params?.id, {
                channelId: patch.channel_id || patch.channelId,
                feedUrl: patch.feed_url || patch.feedUrl,
                name: patch.name,
                feedType: patch.feed_type || patch.feedType,
                category: patch.category,
                tags: patch.tags,
                filters: patch.filters,
                customMessage: patch.custom_message || patch.customMessage,
                color: patch.color,
                pingRoleId: patch.ping_role_id || patch.pingRoleId,
                intervalMinutes: patch.interval_minutes || patch.intervalMinutes,
                enabled: patch.enabled
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * DELETE /api/autofeeds/:id
     */
    async deleteFeed(req) {
        try {
            return await this.service.deleteFeed(req.params?.id);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * POST /api/autofeeds/:id/test
     */
    async testFeed(req) {
        try {
            return await this.service.testFeed(req.params?.id);
        } catch (err) {
            return { success: false, error: err.message };
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
