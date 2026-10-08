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
                { name: 'digest_mode', type: "text DEFAULT 'realtime' NOT NULL" },
                { name: 'digest_schedule', type: "text DEFAULT '08:00'" },
                { name: 'digest_channel_id', type: "text" },
                { name: 'enable_gamification', type: "boolean DEFAULT false NOT NULL" },
                { name: 'gamification_xp_reward', type: "integer DEFAULT 25 NOT NULL" },
                { name: 'channel_tag_routing', type: "text DEFAULT '{}' NOT NULL" },
                { name: 'quiet_hours', type: "text DEFAULT '{}' NOT NULL" },
                { name: 'max_posts_per_hour', type: "integer DEFAULT 0 NOT NULL" },
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

            // 3. Table d'historique anti-doublons & recherche
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_history" (
                    "id" text PRIMARY KEY NOT NULL,
                    "feed_id" text NOT NULL,
                    "guild_id" text,
                    "item_guid" text NOT NULL,
                    "item_url" text,
                    "item_title" text,
                    "item_author" text,
                    "item_content" text,
                    "tags" text DEFAULT '[]' NOT NULL,
                    "is_digest" boolean DEFAULT false NOT NULL,
                    "clicks_count" integer DEFAULT 0 NOT NULL,
                    "posted_at" bigint NOT NULL
                );
            `);

            const histColsToAdd = [
                { name: 'guild_id', type: 'text' },
                { name: 'item_author', type: 'text' },
                { name: 'item_content', type: 'text' },
                { name: 'tags', type: "text DEFAULT '[]' NOT NULL" },
                { name: 'is_digest', type: "boolean DEFAULT false NOT NULL" },
                { name: 'clicks_count', type: "integer DEFAULT 0 NOT NULL" }
            ];
            for (const col of histColsToAdd) {
                await db.pool.query(`
                    ALTER TABLE "autofeed_history" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type};
                `).catch(() => {});
            }

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_autofeed_hist_lookup" ON "autofeed_history" ("feed_id", "item_guid");
                CREATE INDEX IF NOT EXISTS "idx_autofeed_hist_guild" ON "autofeed_history" ("guild_id");
            `).catch(() => {});

            // 4. Table des récompenses / claims Drop Hunter
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_claims" (
                    "id" text PRIMARY KEY NOT NULL,
                    "feed_id" text NOT NULL,
                    "item_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "guild_id" text NOT NULL,
                    "xp_awarded" integer DEFAULT 0 NOT NULL,
                    "claimed_at" bigint NOT NULL,
                    CONSTRAINT "autofeed_claims_unique" UNIQUE("feed_id", "item_id", "user_id")
                );
            `);

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_autofeed_claims_item" ON "autofeed_claims" ("feed_id", "item_id");
                CREATE INDEX IF NOT EXISTS "idx_autofeed_claims_user" ON "autofeed_claims" ("guild_id", "user_id");
            `).catch(() => {});

            // 5. Table des sessions de live (Twitch, Kick, YouTube Live)
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
        digestMode = 'realtime',
        digestSchedule = '08:00',
        digestChannelId = null,
        enableGamification = false,
        gamificationXpReward = 25,
        channelTagRouting = {},
        quietHours = {},
        maxPostsPerHour = 0,
        intervalMinutes = 15
    }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
        const filtersJson = JSON.stringify(filters || {});
        const routingJson = JSON.stringify(channelTagRouting || {});
        const quietHoursJson = JSON.stringify(quietHours || {});

        await db.pool.query(
            `INSERT INTO autofeeds (
                id, guild_id, channel_id, feed_url, name, feed_type,
                category, tags, filters, custom_message, color,
                ping_role_id, subscriber_role_id, notification_delivery,
                create_thread, thread_auto_archive_duration,
                use_webhook, enable_media_proxy, ignore_shorts,
                ai_summary, ai_translate,
                digest_mode, digest_schedule, digest_channel_id,
                enable_gamification, gamification_xp_reward,
                channel_tag_routing, quiet_hours, max_posts_per_hour,
                interval_minutes, enabled, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, true, $31, $31)`,
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
                digestMode || 'realtime',
                digestSchedule || '08:00',
                digestChannelId || null,
                Boolean(enableGamification),
                Number(gamificationXpReward || 25),
                routingJson,
                quietHoursJson,
                Number(maxPostsPerHour || 0),
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
            digestMode: patch.digestMode !== undefined ? patch.digestMode : current.digestMode,
            digestSchedule: patch.digestSchedule !== undefined ? patch.digestSchedule : current.digestSchedule,
            digestChannelId: patch.digestChannelId !== undefined ? patch.digestChannelId : current.digestChannelId,
            enableGamification: patch.enableGamification !== undefined ? Boolean(patch.enableGamification) : current.enableGamification,
            gamificationXpReward: patch.gamificationXpReward !== undefined ? Number(patch.gamificationXpReward) : current.gamificationXpReward,
            channelTagRouting: patch.channelTagRouting !== undefined ? patch.channelTagRouting : current.channelTagRouting,
            quietHours: patch.quietHours !== undefined ? patch.quietHours : current.quietHours,
            maxPostsPerHour: patch.maxPostsPerHour !== undefined ? Number(patch.maxPostsPerHour) : current.maxPostsPerHour,
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
                digest_mode = $21,
                digest_schedule = $22,
                digest_channel_id = $23,
                enable_gamification = $24,
                gamification_xp_reward = $25,
                channel_tag_routing = $26,
                quiet_hours = $27,
                max_posts_per_hour = $28,
                interval_minutes = $29,
                enabled = $30,
                updated_at = $31
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
                updated.digestMode,
                updated.digestSchedule,
                updated.digestChannelId,
                updated.enableGamification,
                updated.gamificationXpReward,
                JSON.stringify(updated.channelTagRouting),
                JSON.stringify(updated.quietHours),
                updated.maxPostsPerHour,
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

    async recordPostedItem(feedId, itemGuid, itemUrl = null, itemTitle = null, { guildId = null, itemAuthor = null, itemContent = null, tags = [], isDigest = false } = {}) {
        await this.initSchema();
        let targetGuildId = guildId;
        if (!targetGuildId && feedId) {
            const fRes = await db.pool.query(`SELECT guild_id FROM autofeeds WHERE id = $1`, [feedId]);
            targetGuildId = fRes.rows?.[0]?.guild_id || null;
        }
        const id = newId();
        const now = Date.now();
        const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
        await db.pool.query(
            `INSERT INTO autofeed_history (id, feed_id, guild_id, item_guid, item_url, item_title, item_author, item_content, tags, is_digest, clicks_count, posted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11)`,
            [id, feedId, targetGuildId, itemGuid, itemUrl, itemTitle, itemAuthor, itemContent ? String(itemContent).slice(0, 1000) : null, tagsJson, Boolean(isDigest), now]
        ).catch(() => {});
    }

    async logHistory({ feedId, itemId, title, link, contentSnippet, itemTags = [], itemCategory = null, guildId = null, isDigest = false }) {
        return this.recordPostedItem(feedId, itemId, link, title, {
            guildId,
            itemAuthor: null,
            itemContent: contentSnippet,
            tags: itemTags,
            isDigest
        });
    }

    async searchHistory(guildId, query, limit = 10) {
        await this.initSchema();
        let queryString = '';
        if (typeof query === 'object' && query !== null) {
            queryString = query.query || query.q || query.tag || '';
        } else {
            queryString = String(query || '');
        }

        const q = `%${queryString.trim().toLowerCase()}%`;
        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name, f.feed_type, f.category
             FROM autofeed_history h
             LEFT JOIN autofeeds f ON h.feed_id = f.id
             WHERE (h.guild_id = $1 OR f.guild_id = $1)
               AND (LOWER(h.item_title) LIKE $2 OR LOWER(h.item_author) LIKE $2 OR LOWER(h.item_content) LIKE $2 OR LOWER(h.tags) LIKE $2)
             ORDER BY h.posted_at DESC
             LIMIT $3`,
            [guildId, q, Math.max(1, Math.min(Number(limit) || 10, 50))]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            feedId: r.feed_id,
            guildId: r.guild_id,
            feedName: r.feed_name || 'Flux',
            itemGuid: r.item_guid,
            url: r.item_url,
            title: r.item_title,
            author: r.item_author,
            content: r.item_content,
            tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : (r.tags || []),
            isDigest: Boolean(r.is_digest),
            clicksCount: Number(r.clicks_count || 0),
            postedAt: Number(r.posted_at || 0)
        }));
    }

    async incrementClick(feedId, itemGuid) {
        await this.initSchema();
        await db.pool.query(
            `UPDATE autofeed_history SET clicks_count = clicks_count + 1 WHERE feed_id = $1 AND item_guid = $2`,
            [feedId, itemGuid]
        ).catch(() => {});
    }

    // ==========================================
    // DROP HUNTER / CLAIMS (GAMIFICATION)
    // ==========================================

    async claimItem({ feedId, itemId, userId, guildId, xpAwarded = 25 }) {
        await this.initSchema();
        // Vérifier si déjà réclamé
        const check = await db.pool.query(
            `SELECT id FROM autofeed_claims WHERE feed_id = $1 AND item_id = $2 AND user_id = $3 LIMIT 1`,
            [feedId, itemId, userId]
        );
        if (check.rows?.[0]) {
            const countRes = await db.pool.query(
                `SELECT COUNT(*) as count FROM autofeed_claims WHERE feed_id = $1 AND item_id = $2`,
                [feedId, itemId]
            );
            return {
                success: false,
                alreadyClaimed: true,
                claimsCount: Number(countRes.rows?.[0]?.count || 1)
            };
        }

        const id = newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO autofeed_claims (id, feed_id, item_id, user_id, guild_id, xp_awarded, claimed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, feedId, itemId, userId, guildId, Number(xpAwarded || 0), now]
        );

        const countRes = await db.pool.query(
            `SELECT COUNT(*) as count FROM autofeed_claims WHERE feed_id = $1 AND item_id = $2`,
            [feedId, itemId]
        );

        return {
            success: true,
            alreadyClaimed: false,
            xpAwarded: Number(xpAwarded || 0),
            claimsCount: Number(countRes.rows?.[0]?.count || 1)
        };
    }

    async getItemClaims(feedId, itemId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_claims WHERE feed_id = $1 AND item_id = $2 ORDER BY claimed_at ASC`,
            [feedId, itemId]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            feedId: r.feed_id,
            itemId: r.item_id,
            userId: r.user_id,
            guildId: r.guild_id,
            xpAwarded: Number(r.xp_awarded || 0),
            claimedAt: Number(r.claimed_at || 0)
        }));
    }

    async getClaimsCount(feedId, itemId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT COUNT(*) as count FROM autofeed_claims WHERE feed_id = $1 AND item_id = $2`,
            [feedId, itemId]
        );
        return Number(res.rows?.[0]?.count || 0);
    }

    async getUserClaims(arg1, arg2) {
        await this.initSchema();
        let query;
        let params;
        if (!arg2) {
            query = `SELECT * FROM autofeed_claims WHERE user_id = $1 ORDER BY claimed_at DESC`;
            params = [arg1];
        } else {
            query = `SELECT * FROM autofeed_claims WHERE (guild_id = $1 AND user_id = $2) OR (user_id = $1 AND guild_id = $2) ORDER BY claimed_at DESC`;
            params = [arg1, arg2];
        }
        const res = await db.pool.query(query, params);
        return (res.rows || []).map(r => ({
            id: r.id,
            feedId: r.feed_id,
            itemId: r.item_id,
            userId: r.user_id,
            guildId: r.guild_id,
            xpAwarded: Number(r.xp_awarded || 0),
            claimedAt: Number(r.claimed_at || 0)
        }));
    }

    // ==========================================
    // STATISTIQUES & ANALYTICS
    // ==========================================

    async getFeedStats(guildId) {
        await this.initSchema();
        const feeds = await this.listByGuild(guildId);
        const totalFeeds = feeds.length;
        const activeFeeds = feeds.filter(f => f.enabled).length;

        const subsRes = await db.pool.query(
            `SELECT COUNT(*) as count FROM autofeed_subscriptions WHERE guild_id = $1`,
            [guildId]
        );
        const totalSubs = Number(subsRes.rows?.[0]?.count || 0);

        const histRes = await db.pool.query(
            `SELECT COUNT(h.id) as count, COALESCE(SUM(h.clicks_count), 0) as total_clicks
             FROM autofeed_history h
             LEFT JOIN autofeeds f ON h.feed_id = f.id
             WHERE h.guild_id = $1 OR f.guild_id = $1`,
            [guildId]
        );
        const totalPosts = Number(histRes.rows?.[0]?.count || 0);
        const totalClicks = Number(histRes.rows?.[0]?.total_clicks || 0);

        const claimsRes = await db.pool.query(
            `SELECT COUNT(*) as count, COALESCE(SUM(xp_awarded), 0) as total_xp FROM autofeed_claims WHERE guild_id = $1`,
            [guildId]
        );
        const totalClaims = Number(claimsRes.rows?.[0]?.count || 0);
        const totalXpAwarded = Number(claimsRes.rows?.[0]?.total_xp || 0);

        // Top 5 tags sur les flux de la guilde
        const tagMap = {};
        for (const f of feeds) {
            for (const t of (f.tags || [])) {
                tagMap[t] = (tagMap[t] || 0) + 1;
            }
        }
        const topTags = Object.entries(tagMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag, count]) => ({ tag, count }));

        // Répartition des fournisseurs (topProviders)
        const providerMap = {};
        for (const f of feeds) {
            const p = f.feedType || 'rss';
            providerMap[p] = (providerMap[p] || 0) + 1;
        }
        const topProviders = Object.entries(providerMap)
            .sort((a, b) => b[1] - a[1])
            .map(([provider, count]) => ({ provider, count }));

        return {
            totalFeeds,
            activeFeeds,
            totalSubscriptions: totalSubs,
            totalPosts,
            totalClicks,
            totalClaims,
            totalXpAwarded,
            topTags,
            topProviders
        };
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
        let channelTagRouting = {};
        let quietHours = {};
        try {
            tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []);
        } catch { tags = []; }

        try {
            filters = typeof row.filters === 'string' ? JSON.parse(row.filters) : (row.filters || {});
        } catch { filters = {}; }

        try {
            channelTagRouting = typeof row.channel_tag_routing === 'string' ? JSON.parse(row.channel_tag_routing) : (row.channel_tag_routing || {});
        } catch { channelTagRouting = {}; }

        try {
            quietHours = typeof row.quiet_hours === 'string' ? JSON.parse(row.quiet_hours) : (row.quiet_hours || {});
        } catch { quietHours = {}; }

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
            digestMode: row.digest_mode || 'realtime',
            digestSchedule: row.digest_schedule || '08:00',
            digestChannelId: row.digest_channel_id || null,
            enableGamification: Boolean(row.enable_gamification),
            gamificationXpReward: Number(row.gamification_xp_reward || 25),
            channelTagRouting: channelTagRouting || {},
            quietHours: quietHours || {},
            maxPostsPerHour: Number(row.max_posts_per_hour || 0),
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
