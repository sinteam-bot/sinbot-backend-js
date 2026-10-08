/**
 * src/modules/util_autofeeds/services/autofeeds.repository.js
 *
 * Couche BDD pour les flux automatiques (Autofeeds), souscriptions et historique.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class AutofeedsRepository {
    constructor() {
        this._initialized = false;
    }

    /**
     * Initialise et applique les extensions de schéma de manière idempotente.
     */
    async initSchema() {
        if (this._initialized) return;

        try {
            // 1. Table principale des flux
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeeds" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "channel_id" text NOT NULL,
                    "feed_url" text NOT NULL,
                    "name" text,
                    "feed_type" text DEFAULT 'rss' NOT NULL,
                    "category" text DEFAULT 'general' NOT NULL,
                    "tags" text DEFAULT '[]' NOT NULL,
                    "filters" text DEFAULT '{}' NOT NULL,
                    "custom_message" text,
                    "color" text DEFAULT '#FF4500' NOT NULL,
                    "ping_role_id" text,
                    "last_item_id" text,
                    "last_item_published_at" bigint DEFAULT 0 NOT NULL,
                    "interval_minutes" integer DEFAULT 15 NOT NULL,
                    "enabled" boolean DEFAULT true NOT NULL,
                    "created_at" bigint NOT NULL,
                    "updated_at" bigint
                );
            `);

            // Ajouter les colonnes manquantes si la table existait déjà dans une version antérieure
            const columnsToAdd = [
                { name: 'name', type: 'text' },
                { name: 'category', type: "text DEFAULT 'general' NOT NULL" },
                { name: 'tags', type: "text DEFAULT '[]' NOT NULL" },
                { name: 'filters', type: "text DEFAULT '{}' NOT NULL" },
                { name: 'custom_message', type: 'text' },
                { name: 'color', type: "text DEFAULT '#FF4500' NOT NULL" },
                { name: 'ping_role_id', type: 'text' },
                { name: 'subscriber_role_id', type: 'text' },
                { name: 'notification_delivery', type: "text DEFAULT 'channel' NOT NULL" },
                { name: 'create_thread', type: "boolean DEFAULT false NOT NULL" },
                { name: 'thread_auto_archive_duration', type: "integer DEFAULT 1440 NOT NULL" },
                { name: 'use_webhook', type: "boolean DEFAULT true NOT NULL" },
                { name: 'enable_media_proxy', type: "boolean DEFAULT true NOT NULL" },
                { name: 'ignore_shorts', type: "boolean DEFAULT false NOT NULL" },
                { name: 'ai_summary', type: "boolean DEFAULT false NOT NULL" },
                { name: 'ai_translate', type: "text" },
                { name: 'last_checked_at', type: "bigint DEFAULT 0 NOT NULL" },
                { name: 'last_status', type: "text DEFAULT 'ok' NOT NULL" },
                { name: 'last_error', type: "text" },
                { name: 'fail_count', type: "integer DEFAULT 0 NOT NULL" },
                { name: 'updated_at', type: 'bigint' }
            ];

            for (const col of columnsToAdd) {
                await db.pool.query(`
                    ALTER TABLE "autofeeds" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type};
                `).catch(() => {});
            }

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_autofeeds_guild" ON "autofeeds" USING btree ("guild_id");
            `).catch(() => {});

            // 2. Table des souscriptions utilisateurs
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_subscriptions" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "target_type" text NOT NULL,
                    "target_value" text NOT NULL,
                    "notify_mode" text DEFAULT 'mention' NOT NULL,
                    "filters" text DEFAULT '{}' NOT NULL,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "autofeed_subs_unique" UNIQUE("guild_id", "user_id", "target_type", "target_value")
                );
            `);

            await db.pool.query(`
                ALTER TABLE "autofeed_subscriptions" ADD COLUMN IF NOT EXISTS "filters" text DEFAULT '{}' NOT NULL;
            `).catch(() => {});

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_autofeed_subs_lookup" ON "autofeed_subscriptions" ("guild_id", "target_type", "target_value");
                CREATE INDEX IF NOT EXISTS "idx_autofeed_subs_user" ON "autofeed_subscriptions" ("guild_id", "user_id");
            `).catch(() => {});

            // 3. Table d'historique anti-doublons
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_history" (
                    "id" text PRIMARY KEY NOT NULL,
                    "feed_id" text NOT NULL,
                    "item_guid" text NOT NULL,
                    "item_url" text,
                    "item_title" text,
                    "posted_at" bigint NOT NULL
                );
            `);

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_autofeed_hist_lookup" ON "autofeed_history" ("feed_id", "item_guid");
            `).catch(() => {});

            // 4. Table des sessions de live (Twitch, Kick, YouTube Live)
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_live_sessions" (
                    "id" text PRIMARY KEY NOT NULL,
                    "feed_id" text NOT NULL,
                    "stream_id" text NOT NULL,
                    "streamer_name" text NOT NULL,
                    "channel_id" text NOT NULL,
                    "message_id" text NOT NULL,
                    "thread_id" text,
                    "title" text,
                    "game" text,
                    "url" text,
                    "started_at" bigint NOT NULL,
                    "ended_at" bigint,
                    "status" text DEFAULT 'live' NOT NULL,
                    "created_at" bigint NOT NULL
                );
            `);

            await db.pool.query(`
                ALTER TABLE "autofeed_live_sessions" ADD COLUMN IF NOT EXISTS "thread_id" text;
            `).catch(() => {});

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_live_session_lookup" ON "autofeed_live_sessions" ("feed_id", "stream_id");
                CREATE INDEX IF NOT EXISTS "idx_live_session_status" ON "autofeed_live_sessions" ("feed_id", "status");
            `).catch(() => {});

            this._initialized = true;
        } catch (err) {
            console.warn('[AutofeedsRepository] Erreur initSchema:', err.message);
        }
    }

    // ==========================================
    // FLUX (CRUD)
    // ==========================================

    async addFeed({
        guildId,
        channelId,
        feedUrl,
        name = null,
        feedType = 'rss',
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
        intervalMinutes = 15
    }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
        const filtersJson = JSON.stringify(filters || {});

        await db.pool.query(
            `INSERT INTO autofeeds (
                id, guild_id, channel_id, feed_url, name, feed_type,
                category, tags, filters, custom_message, color,
                ping_role_id, subscriber_role_id, notification_delivery,
                create_thread, thread_auto_archive_duration,
                use_webhook, enable_media_proxy, ignore_shorts,
                ai_summary, ai_translate,
                interval_minutes, enabled, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, true, $23, $23)`,
            [
                id,
                guildId,
                channelId,
                feedUrl.trim(),
                name,
                feedType,
                category || 'general',
                tagsJson,
                filtersJson,
                customMessage,
                color || '#FF4500',
                pingRoleId,
                subscriberRoleId,
                notificationDelivery || 'channel',
                Boolean(createThread),
                Number(threadAutoArchiveDuration || 1440),
                useWebhook !== false,
                enableMediaProxy !== false,
                Boolean(ignoreShorts),
                Boolean(aiSummary),
                aiTranslate || null,
                intervalMinutes,
                now
            ]
        );

        return this.getFeedById(id);
    }

    async getFeedById(id) {
        await this.initSchema();
        const res = await db.pool.query(`SELECT * FROM autofeeds WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async listByGuild(guildId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeeds WHERE guild_id = $1 ORDER BY created_at ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async listAllActive() {
        await this.initSchema();
        const res = await db.pool.query(`SELECT * FROM autofeeds WHERE enabled = true`);
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async updateFeed(id, patch = {}) {
        await this.initSchema();
        const current = await this.getFeedById(id);
        if (!current) return null;

        const updated = {
            channelId: patch.channelId !== undefined ? patch.channelId : current.channelId,
            feedUrl: patch.feedUrl !== undefined ? patch.feedUrl : current.feedUrl,
            name: patch.name !== undefined ? patch.name : current.name,
            feedType: patch.feedType !== undefined ? patch.feedType : current.feedType,
            category: patch.category !== undefined ? patch.category : current.category,
            tags: patch.tags !== undefined ? patch.tags : current.tags,
            filters: patch.filters !== undefined ? patch.filters : current.filters,
            customMessage: patch.customMessage !== undefined ? patch.customMessage : current.customMessage,
            color: patch.color !== undefined ? patch.color : current.color,
            pingRoleId: patch.pingRoleId !== undefined ? patch.pingRoleId : current.pingRoleId,
            subscriberRoleId: patch.subscriberRoleId !== undefined ? patch.subscriberRoleId : current.subscriberRoleId,
            notificationDelivery: patch.notificationDelivery !== undefined ? patch.notificationDelivery : current.notificationDelivery,
            createThread: patch.createThread !== undefined ? Boolean(patch.createThread) : current.createThread,
            threadAutoArchiveDuration: patch.threadAutoArchiveDuration !== undefined ? Number(patch.threadAutoArchiveDuration) : current.threadAutoArchiveDuration,
            useWebhook: patch.useWebhook !== undefined ? Boolean(patch.useWebhook) : current.useWebhook,
            enableMediaProxy: patch.enableMediaProxy !== undefined ? Boolean(patch.enableMediaProxy) : current.enableMediaProxy,
            ignoreShorts: patch.ignoreShorts !== undefined ? Boolean(patch.ignoreShorts) : current.ignoreShorts,
            aiSummary: patch.aiSummary !== undefined ? Boolean(patch.aiSummary) : current.aiSummary,
            aiTranslate: patch.aiTranslate !== undefined ? patch.aiTranslate : current.aiTranslate,
            intervalMinutes: patch.intervalMinutes !== undefined ? patch.intervalMinutes : current.intervalMinutes,
            enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : current.enabled,
            updatedAt: Date.now()
        };

        await db.pool.query(
            `UPDATE autofeeds SET
                channel_id = $2,
                feed_url = $3,
                name = $4,
                feed_type = $5,
                category = $6,
                tags = $7,
                filters = $8,
                custom_message = $9,
                color = $10,
                ping_role_id = $11,
                subscriber_role_id = $12,
                notification_delivery = $13,
                create_thread = $14,
                thread_auto_archive_duration = $15,
                use_webhook = $16,
                enable_media_proxy = $17,
                ignore_shorts = $18,
                ai_summary = $19,
                ai_translate = $20,
                interval_minutes = $21,
                enabled = $22,
                updated_at = $23
             WHERE id = $1`,
            [
                id,
                updated.channelId,
                updated.feedUrl,
                updated.name,
                updated.feedType,
                updated.category,
                JSON.stringify(updated.tags),
                JSON.stringify(updated.filters),
                updated.customMessage,
                updated.color,
                updated.pingRoleId,
                updated.subscriberRoleId,
                updated.notificationDelivery,
                updated.createThread,
                updated.threadAutoArchiveDuration,
                updated.useWebhook,
                updated.enableMediaProxy,
                updated.ignoreShorts,
                updated.aiSummary,
                updated.aiTranslate,
                updated.intervalMinutes,
                updated.enabled,
                updated.updatedAt
            ]
        );

        return this.getFeedById(id);
    }

    async updateLastItem(id, lastItemId, lastItemPublishedAt) {
        await this.initSchema();
        await db.pool.query(
            `UPDATE autofeeds SET last_item_id = $2, last_item_published_at = $3 WHERE id = $1`,
            [id, lastItemId, lastItemPublishedAt]
        );
    }

    async deleteFeed(id) {
        await this.initSchema();
        await db.pool.query(`DELETE FROM autofeed_subscriptions WHERE target_type = 'feed' AND target_value = $1`, [id]);
        await db.pool.query(`DELETE FROM autofeed_history WHERE feed_id = $1`, [id]);
        await db.pool.query(`DELETE FROM autofeeds WHERE id = $1`, [id]);
    }

    // ==========================================
    // SOUSCRIPTIONS (CRUD)
    // ==========================================

    async addSubscription({ guildId, userId, targetType, targetValue, notifyMode = 'mention', filters = {} }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        const normalizedTarget = (targetValue || '').trim().toLowerCase();
        const filtersJson = JSON.stringify(filters || {});

        await db.pool.query(
            `INSERT INTO autofeed_subscriptions (id, guild_id, user_id, target_type, target_value, notify_mode, filters, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (guild_id, user_id, target_type, target_value)
             DO UPDATE SET notify_mode = EXCLUDED.notify_mode, filters = EXCLUDED.filters`,
            [id, guildId, userId, targetType, normalizedTarget, notifyMode, filtersJson, now]
        );

        return {
            id,
            guildId,
            userId,
            targetType,
            targetValue: normalizedTarget,
            notifyMode,
            filters: filters || {},
            createdAt: now
        };
    }

    async recordFeedCheckResult(id, { status = 'ok', error = null, lastItemId = null, lastItemPublishedAt = null } = {}) {
        await this.initSchema();
        const now = Date.now();
        if (status === 'ok') {
            if (lastItemId !== null && lastItemPublishedAt !== null) {
                await db.pool.query(
                    `UPDATE autofeeds SET last_checked_at = $2, last_status = 'ok', last_error = NULL, fail_count = 0, last_item_id = $3, last_item_published_at = $4 WHERE id = $1`,
                    [id, now, lastItemId, lastItemPublishedAt]
                ).catch(() => {});
            } else {
                await db.pool.query(
                    `UPDATE autofeeds SET last_checked_at = $2, last_status = 'ok', last_error = NULL, fail_count = 0 WHERE id = $1`,
                    [id, now]
                ).catch(() => {});
            }
            return { status: 'ok', failCount: 0, autoDisabled: false };
        } else {
            const current = await this.getFeedById(id);
            const currentFails = current ? current.failCount : 0;
            const newFails = currentFails + 1;
            const autoDisable = newFails >= 10;
            await db.pool.query(
                `UPDATE autofeeds SET last_checked_at = $2, last_status = 'error', last_error = $3, fail_count = fail_count + 1, enabled = CASE WHEN $4 = true THEN false ELSE enabled END WHERE id = $1`,
                [id, now, String(error || 'Erreur').slice(0, 500), autoDisable]
            ).catch(() => {});
            return { status: 'error', failCount: newFails, autoDisabled: autoDisable };
        }
    }

    async removeSubscription({ guildId, userId, targetType, targetValue }) {
        await this.initSchema();
        const normalizedTarget = (targetValue || '').trim().toLowerCase();
        const res = await db.pool.query(
            `DELETE FROM autofeed_subscriptions
             WHERE guild_id = $1 AND user_id = $2 AND target_type = $3 AND target_value = $4`,
            [guildId, userId, targetType, normalizedTarget]
        );
        return { deleted: (res.rowCount || 0) > 0 };
    }

    async removeSubscriptionById(id) {
        await this.initSchema();
        const res = await db.pool.query(`DELETE FROM autofeed_subscriptions WHERE id = $1`, [id]);
        return { deleted: (res.rowCount || 0) > 0 };
    }

    async listUserSubscriptions(guildId, userId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_subscriptions WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
            [guildId, userId]
        );
        return (res.rows || []).map(r => this._mapSubRow(r));
    }

    async listGuildSubscriptions(guildId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_subscriptions WHERE guild_id = $1 ORDER BY created_at DESC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapSubRow(r));
    }

    // ==========================================
    // HISTORIQUE ANTI-DOUBLONS
    // ==========================================

    async hasItemBeenPosted(feedId, itemGuid) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT id FROM autofeed_history WHERE feed_id = $1 AND item_guid = $2 LIMIT 1`,
            [feedId, itemGuid]
        );
        return Boolean(res.rows?.[0]);
    }

    async recordPostedItem(feedId, itemGuid, itemUrl = null, itemTitle = null) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO autofeed_history (id, feed_id, item_guid, item_url, item_title, posted_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, feedId, itemGuid, itemUrl, itemTitle, now]
        ).catch(() => {});
    }

    // ==========================================
    // SESSIONS DE LIVE
    // ==========================================

    async getActiveLiveSession(feedId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_live_sessions 
             WHERE feed_id = $1 AND status = 'live'
             ORDER BY started_at DESC LIMIT 1`,
            [feedId]
        );
        return res.rows?.[0] ? this._mapLiveSessionRow(res.rows[0]) : null;
    }

    async saveLiveSession({ feedId, streamId, streamerName, channelId, messageId, threadId = null, title, game, url, startedAt }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO autofeed_live_sessions (
                id, feed_id, stream_id, streamer_name, channel_id, message_id, thread_id,
                title, game, url, started_at, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'live', $12)`,
            [id, feedId, streamId, streamerName, channelId, messageId, threadId || null, title || null, game || null, url || null, Number(startedAt || now), now]
        );
        return {
            id,
            feedId,
            streamId,
            streamerName,
            channelId,
            messageId,
            threadId: threadId || null,
            title,
            game,
            url,
            startedAt: Number(startedAt || now),
            endedAt: null,
            status: 'live',
            createdAt: now
        };
    }

    async closeLiveSession(id, { endedAt = Date.now(), game = null, title = null } = {}) {
        await this.initSchema();
        const params = [endedAt, id];
        let extra = '';
        if (game) {
            extra += `, game = $${params.length + 1}`;
            params.push(game);
        }
        if (title) {
            extra += `, title = $${params.length + 1}`;
            params.push(title);
        }
        await db.pool.query(
            `UPDATE autofeed_live_sessions 
             SET status = 'offline', ended_at = $1 ${extra}
             WHERE id = $2`,
            params
        );
    }

    // ==========================================
    // MAPPERS
    // ==========================================

    _mapRow(row) {
        let tags = [];
        let filters = {};
        try {
            tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []);
        } catch { tags = []; }

        try {
            filters = typeof row.filters === 'string' ? JSON.parse(row.filters) : (row.filters || {});
        } catch { filters = {}; }

        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            feedUrl: row.feed_url,
            url: row.feed_url,
            name: row.name || null,
            feedType: row.feed_type || 'rss',
            category: row.category || 'general',
            tags: Array.isArray(tags) ? tags : [],
            filters: filters || {},
            customMessage: row.custom_message || null,
            color: row.color || '#FF4500',
            pingRoleId: row.ping_role_id || null,
            subscriberRoleId: row.subscriber_role_id || null,
            notificationDelivery: row.notification_delivery || 'channel',
            createThread: Boolean(row.create_thread),
            threadAutoArchiveDuration: Number(row.thread_auto_archive_duration || 1440),
            useWebhook: row.use_webhook !== false,
            enableMediaProxy: row.enable_media_proxy !== false,
            ignoreShorts: Boolean(row.ignore_shorts),
            aiSummary: Boolean(row.ai_summary),
            aiTranslate: row.ai_translate || null,
            lastItemId: row.last_item_id,
            lastItemPublishedAt: Number(row.last_item_published_at || 0),
            intervalMinutes: Number(row.interval_minutes || 15),
            enabled: Boolean(row.enabled),
            isActive: Boolean(row.enabled),
            lastCheckedAt: Number(row.last_checked_at || 0),
            lastStatus: row.last_status || 'ok',
            lastError: row.last_error || null,
            failCount: Number(row.fail_count || 0),
            createdAt: Number(row.created_at || 0),
            updatedAt: row.updated_at ? Number(row.updated_at) : null
        };
    }

    _mapSubRow(row) {
        let filters = {};
        try {
            filters = typeof row.filters === 'string' ? JSON.parse(row.filters) : (row.filters || {});
        } catch { filters = {}; }

        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            targetType: row.target_type,
            targetValue: row.target_value,
            notifyMode: row.notify_mode || 'mention',
            filters: filters || {},
            createdAt: Number(row.created_at || 0)
        };
    }

    _mapLiveSessionRow(row) {
        return {
            id: row.id,
            feedId: row.feed_id,
            streamId: row.stream_id,
            streamerName: row.streamer_name,
            channelId: row.channel_id,
            messageId: row.message_id,
            threadId: row.thread_id || null,
            title: row.title || null,
            game: row.game || null,
            url: row.url || null,
            startedAt: Number(row.started_at || 0),
            endedAt: row.ended_at ? Number(row.ended_at) : null,
            status: row.status || 'live',
            createdAt: Number(row.created_at || 0)
        };
    }
}

module.exports = { AutofeedsRepository };
