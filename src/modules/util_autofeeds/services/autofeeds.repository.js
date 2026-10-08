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
                { name: 'auto_reactions', type: "text DEFAULT '[]' NOT NULL" },
                { name: 'auto_poll', type: "text DEFAULT '{}' NOT NULL" },
                { name: 'breaking_keywords', type: "text DEFAULT '[]' NOT NULL" },
                { name: 'bypass_quiet_hours', type: "boolean DEFAULT false NOT NULL" },
                { name: 'breaking_role_id', type: "text" },
                { name: 'auto_expire_days', type: "integer DEFAULT 0 NOT NULL" },
                { name: 'enable_audio_briefing', type: "boolean DEFAULT false NOT NULL" },
                { name: 'enable_voting', type: "boolean DEFAULT false NOT NULL" },
                { name: 'best_of_threshold', type: "integer DEFAULT 5 NOT NULL" },
                { name: 'best_of_channel_id', type: "text" },
                { name: 'min_discount_percent', type: "integer DEFAULT 0 NOT NULL" },
                { name: 'auto_sync_events', type: "boolean DEFAULT false NOT NULL" },
                { name: 'good_vibes_only', type: "boolean DEFAULT false NOT NULL" },
                { name: 'enable_security_scan', type: "boolean DEFAULT true NOT NULL" },
                { name: 'translate_title_to_fr', type: "boolean DEFAULT false NOT NULL" },
                { name: 'anti_clickbait', type: "boolean DEFAULT false NOT NULL" },
                { name: 'require_approval', type: "boolean DEFAULT false NOT NULL" },
                { name: 'moderation_channel_id', type: "text" },
                { name: 'enable_story_clustering', type: "boolean DEFAULT false NOT NULL" },
                { name: 'cluster_mode', type: "text DEFAULT 'merge' NOT NULL" },
                { name: 'enable_video_summary', type: "boolean DEFAULT false NOT NULL" },
                { name: 'auto_smart_tag', type: "boolean DEFAULT false NOT NULL" },
                { name: 'sync_to_knowledge_base', type: "boolean DEFAULT false NOT NULL" },
                { name: 'knowledge_base_type', type: "text DEFAULT 'markdown' NOT NULL" },
                { name: 'knowledge_webhook_url', type: "text" },
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
                    "channel_id" text,
                    "message_id" text,
                    "item_guid" text NOT NULL,
                    "item_url" text,
                    "canonical_url" text,
                    "item_title" text,
                    "item_author" text,
                    "item_content" text,
                    "tags" text DEFAULT '[]' NOT NULL,
                    "is_digest" boolean DEFAULT false NOT NULL,
                    "clicks_count" integer DEFAULT 0 NOT NULL,
                    "is_expired" boolean DEFAULT false NOT NULL,
                    "clustered_with_id" text,
                    "is_best_of" boolean DEFAULT false NOT NULL,
                    "sentiment_score" text,
                    "posted_at" bigint NOT NULL
                );
            `);

            const histColsToAdd = [
                { name: 'guild_id', type: 'text' },
                { name: 'channel_id', type: 'text' },
                { name: 'message_id', type: 'text' },
                { name: 'canonical_url', type: 'text' },
                { name: 'item_author', type: 'text' },
                { name: 'item_content', type: 'text' },
                { name: 'tags', type: "text DEFAULT '[]' NOT NULL" },
                { name: 'is_digest', type: "boolean DEFAULT false NOT NULL" },
                { name: 'clicks_count', type: "integer DEFAULT 0 NOT NULL" },
                { name: 'is_expired', type: "boolean DEFAULT false NOT NULL" },
                { name: 'clustered_with_id', type: 'text' },
                { name: 'related_sources', type: "text DEFAULT '[]' NOT NULL" },
                { name: 'is_best_of', type: "boolean DEFAULT false NOT NULL" },
                { name: 'sentiment_score', type: 'text' },
                { name: 'is_pending_approval', type: "boolean DEFAULT false NOT NULL" },
                { name: 'approved_by', type: 'text' },
                { name: 'rejected_by', type: 'text' },
                { name: 'release_date', type: 'text' },
                { name: 'fact_check_score', type: 'integer' }
            ];
            for (const col of histColsToAdd) {
                await db.pool.query(`
                    ALTER TABLE "autofeed_history" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type};
                `).catch(() => {});
            }

            // 3b. Table d'historique des prix & All-Time Low
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_price_history" (
                    "id" text PRIMARY KEY NOT NULL,
                    "feed_id" text NOT NULL,
                    "item_url" text NOT NULL,
                    "item_title" text,
                    "original_price" text,
                    "current_price" text,
                    "discount_percent" integer DEFAULT 0 NOT NULL,
                    "currency" text DEFAULT 'EUR' NOT NULL,
                    "is_all_time_low" boolean DEFAULT false NOT NULL,
                    "recorded_at" bigint NOT NULL
                );
            `).catch(() => {});

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_autofeed_price_url" ON "autofeed_price_history" ("item_url");
            `).catch(() => {});

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_autofeed_price_feed" ON "autofeed_price_history" ("feed_id");
            `).catch(() => {});

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

            // 6. Table des digests quotidiens individuels en DM
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_user_digests" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "schedule_time" text DEFAULT '08:00' NOT NULL,
                    "is_enabled" boolean DEFAULT true NOT NULL,
                    "last_sent_at" bigint DEFAULT 0 NOT NULL,
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "autofeed_user_digest_unique" UNIQUE("guild_id", "user_id")
                );
            `).catch(() => {});

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_user_digest_schedule" ON "autofeed_user_digests" ("schedule_time", "is_enabled");
            `).catch(() => {});

            // 7. Table des rappels de sortie de jeux & événements
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_release_reminders" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "history_id" text,
                    "item_title" text NOT NULL,
                    "item_url" text,
                    "target_date" text NOT NULL,
                    "is_notified" boolean DEFAULT false NOT NULL,
                    "notified_at" bigint,
                    "created_at" bigint NOT NULL
                );
            `).catch(() => {});

            await db.pool.query(`ALTER TABLE "autofeed_release_reminders" ALTER COLUMN "item_url" DROP NOT NULL;`).catch(() => {});

            await db.pool.query(`
                CREATE INDEX IF NOT EXISTS "idx_release_reminders_target" ON "autofeed_release_reminders" ("target_date", "is_notified");
                CREATE INDEX IF NOT EXISTS "idx_release_reminders_user" ON "autofeed_release_reminders" ("guild_id", "user_id");
            `).catch(() => {});

            // 8. Tables des quiz trivia
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_trivia_quizzes" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "channel_id" text,
                    "message_id" text,
                    "theme" text DEFAULT 'Actualités de la Semaine' NOT NULL,
                    "question" text NOT NULL,
                    "options" text NOT NULL,
                    "correct_option_index" integer NOT NULL,
                    "explanation" text NOT NULL,
                    "source_url" text,
                    "xp_reward" integer DEFAULT 50 NOT NULL,
                    "is_active" boolean DEFAULT true NOT NULL,
                    "created_at" bigint NOT NULL
                );
            `).catch(() => {});

            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_trivia_answers" (
                    "id" text PRIMARY KEY NOT NULL,
                    "quiz_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "guild_id" text NOT NULL,
                    "selected_option_index" integer NOT NULL,
                    "is_correct" boolean NOT NULL,
                    "xp_earned" integer DEFAULT 0 NOT NULL,
                    "answered_at" bigint NOT NULL,
                    CONSTRAINT "autofeed_trivia_answer_unique" UNIQUE("quiz_id", "user_id")
                );
            `).catch(() => {});

            // 9. Tables des paris et prédictions communautaires
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_predictions" (
                    "id" text PRIMARY KEY NOT NULL,
                    "guild_id" text NOT NULL,
                    "feed_id" text,
                    "history_id" text,
                    "title" text NOT NULL,
                    "description" text,
                    "source_url" text,
                    "options" text NOT NULL,
                    "status" text DEFAULT 'open' NOT NULL,
                    "resolved_option_index" integer,
                    "total_pool_xp" integer DEFAULT 0 NOT NULL,
                    "closes_at" bigint,
                    "resolved_at" bigint,
                    "created_at" bigint NOT NULL
                );
            `).catch(() => {});

            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS "autofeed_prediction_bets" (
                    "id" text PRIMARY KEY NOT NULL,
                    "prediction_id" text NOT NULL,
                    "guild_id" text NOT NULL,
                    "user_id" text NOT NULL,
                    "option_index" integer NOT NULL,
                    "amount_xp" integer NOT NULL,
                    "payout_xp" integer DEFAULT 0 NOT NULL,
                    "is_claimed" boolean DEFAULT false NOT NULL,
                    "created_at" bigint NOT NULL
                );
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
        autoSmartTag = false,
        syncToKnowledgeBase = false,
        knowledgeBaseType = 'markdown',
        knowledgeWebhookUrl = null,
        intervalMinutes = 15
    }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
        const filtersJson = JSON.stringify(filters || {});
        const routingJson = JSON.stringify(channelTagRouting || {});
        const quietHoursJson = JSON.stringify(quietHours || {});
        const autoReactionsJson = JSON.stringify(Array.isArray(autoReactions) ? autoReactions : []);
        const autoPollJson = JSON.stringify(autoPoll || {});
        const breakingKeywordsJson = JSON.stringify(Array.isArray(breakingKeywords) ? breakingKeywords : []);

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
                auto_reactions, auto_poll, breaking_keywords,
                bypass_quiet_hours, breaking_role_id, auto_expire_days, enable_audio_briefing,
                enable_voting, best_of_threshold, best_of_channel_id,
                min_discount_percent, auto_sync_events, good_vibes_only, enable_security_scan,
                translate_title_to_fr, anti_clickbait, require_approval, moderation_channel_id,
                enable_story_clustering, cluster_mode, enable_video_summary,
                auto_smart_tag, sync_to_knowledge_base, knowledge_base_type, knowledge_webhook_url,
                interval_minutes, enabled, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, true, $56, $56)`,
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
                autoReactionsJson,
                autoPollJson,
                breakingKeywordsJson,
                Boolean(bypassQuietHours),
                breakingRoleId || null,
                Number(autoExpireDays || 0),
                Boolean(enableAudioBriefing),
                Boolean(enableVoting),
                Number(bestOfThreshold || 5),
                bestOfChannelId || null,
                Number(minDiscountPercent || 0),
                Boolean(autoSyncEvents),
                Boolean(goodVibesOnly),
                enableSecurityScan !== false,
                Boolean(translateTitleToFr),
                Boolean(antiClickbait),
                Boolean(requireApproval),
                moderationChannelId || null,
                Boolean(enableStoryClustering),
                clusterMode || 'merge',
                Boolean(enableVideoSummary),
                Boolean(autoSmartTag),
                Boolean(syncToKnowledgeBase),
                knowledgeBaseType || 'markdown',
                knowledgeWebhookUrl || null,
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

    async getFeed(id) {
        return this.getFeedById(id);
    }

    async getBestOfHistory(guildId, limit = 5) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name 
             FROM autofeed_history h
             JOIN autofeeds f ON h.feed_id = f.id
             WHERE f.guild_id = $1 AND h.is_best_of = true
             ORDER BY h.posted_at DESC
             LIMIT $2`,
            [guildId, limit]
        ).catch(() => ({ rows: [] }));
        return res.rows || [];
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
            autoReactions: patch.autoReactions !== undefined ? patch.autoReactions : current.autoReactions,
            autoPoll: patch.autoPoll !== undefined ? patch.autoPoll : current.autoPoll,
            breakingKeywords: patch.breakingKeywords !== undefined ? patch.breakingKeywords : current.breakingKeywords,
            bypassQuietHours: patch.bypassQuietHours !== undefined ? Boolean(patch.bypassQuietHours) : current.bypassQuietHours,
            breakingRoleId: patch.breakingRoleId !== undefined ? patch.breakingRoleId : current.breakingRoleId,
            autoExpireDays: patch.autoExpireDays !== undefined ? Number(patch.autoExpireDays) : current.autoExpireDays,
            enableAudioBriefing: patch.enableAudioBriefing !== undefined ? Boolean(patch.enableAudioBriefing) : current.enableAudioBriefing,
            enableVoting: patch.enableVoting !== undefined ? Boolean(patch.enableVoting) : current.enableVoting,
            bestOfThreshold: patch.bestOfThreshold !== undefined ? Number(patch.bestOfThreshold) : current.bestOfThreshold,
            bestOfChannelId: patch.bestOfChannelId !== undefined ? patch.bestOfChannelId : current.bestOfChannelId,
            minDiscountPercent: patch.minDiscountPercent !== undefined ? Number(patch.minDiscountPercent) : current.minDiscountPercent,
            autoSyncEvents: patch.autoSyncEvents !== undefined ? Boolean(patch.autoSyncEvents) : current.autoSyncEvents,
            goodVibesOnly: patch.goodVibesOnly !== undefined ? Boolean(patch.goodVibesOnly) : current.goodVibesOnly,
            enableSecurityScan: patch.enableSecurityScan !== undefined ? Boolean(patch.enableSecurityScan) : (current.enableSecurityScan !== false),
            translateTitleToFr: patch.translateTitleToFr !== undefined ? Boolean(patch.translateTitleToFr) : current.translateTitleToFr,
            antiClickbait: patch.antiClickbait !== undefined ? Boolean(patch.antiClickbait) : current.antiClickbait,
            requireApproval: patch.requireApproval !== undefined ? Boolean(patch.requireApproval) : current.requireApproval,
            moderationChannelId: patch.moderationChannelId !== undefined ? patch.moderationChannelId : current.moderationChannelId,
            enableStoryClustering: patch.enableStoryClustering !== undefined ? Boolean(patch.enableStoryClustering) : current.enableStoryClustering,
            clusterMode: patch.clusterMode !== undefined ? patch.clusterMode : current.clusterMode,
            enableVideoSummary: patch.enableVideoSummary !== undefined ? Boolean(patch.enableVideoSummary) : current.enableVideoSummary,
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
                auto_reactions = $29,
                auto_poll = $30,
                breaking_keywords = $31,
                bypass_quiet_hours = $32,
                breaking_role_id = $33,
                auto_expire_days = $34,
                enable_audio_briefing = $35,
                enable_voting = $36,
                best_of_threshold = $37,
                best_of_channel_id = $38,
                min_discount_percent = $39,
                auto_sync_events = $40,
                good_vibes_only = $41,
                enable_security_scan = $42,
                translate_title_to_fr = $43,
                anti_clickbait = $44,
                require_approval = $45,
                moderation_channel_id = $46,
                enable_story_clustering = $47,
                cluster_mode = $48,
                enable_video_summary = $49,
                auto_smart_tag = $50,
                sync_to_knowledge_base = $51,
                knowledge_base_type = $52,
                knowledge_webhook_url = $53,
                interval_minutes = $54,
                enabled = $55,
                updated_at = $56
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
                JSON.stringify(updated.autoReactions || []),
                JSON.stringify(updated.autoPoll || {}),
                JSON.stringify(updated.breakingKeywords || []),
                updated.bypassQuietHours,
                updated.breakingRoleId,
                updated.autoExpireDays,
                updated.enableAudioBriefing,
                updated.enableVoting,
                updated.bestOfThreshold,
                updated.bestOfChannelId,
                updated.minDiscountPercent,
                updated.autoSyncEvents,
                updated.goodVibesOnly,
                updated.enableSecurityScan,
                updated.translateTitleToFr,
                updated.antiClickbait,
                updated.requireApproval,
                updated.moderationChannelId,
                updated.enableStoryClustering,
                updated.clusterMode,
                updated.enableVideoSummary,
                Boolean(updated.autoSmartTag),
                Boolean(updated.syncToKnowledgeBase),
                updated.knowledgeBaseType || 'markdown',
                updated.knowledgeWebhookUrl || null,
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

    async recordPostedItem(feedId, itemGuid, itemUrl = null, itemTitle = null, opts = {}) {
        let fId = feedId;
        let guid = itemGuid;
        let url = itemUrl;
        let title = itemTitle;
        let options = opts;

        if (typeof feedId === 'object' && feedId !== null) {
            fId = feedId.feedId || feedId.feed_id;
            guid = feedId.itemGuid || feedId.item_guid || feedId.itemId || feedId.id;
            url = feedId.itemUrl || feedId.item_url || feedId.url || feedId.link;
            title = feedId.itemTitle || feedId.item_title || feedId.title;
            options = feedId;
        }

        const {
            guildId = null,
            channelId = null,
            messageId = null,
            discordMessageId = null,
            canonicalUrl = null,
            itemAuthor = null,
            itemContent = null,
            tags = [],
            isDigest = false,
            clusteredWithId = null,
            relatedSources = [],
            isBestOf = false,
            sentimentScore = null,
            isPendingApproval = false,
            approvedBy = null,
            rejectedBy = null,
            releaseDate = null,
            factCheckScore = null,
            postedAt = null
        } = options;

        await this.initSchema();
        let targetGuildId = guildId;
        if (!targetGuildId && fId) {
            const fRes = await db.pool.query(`SELECT guild_id FROM autofeeds WHERE id = $1`, [fId]);
            targetGuildId = fRes.rows?.[0]?.guild_id || null;
        }
        const id = newId();
        const now = postedAt ? Number(postedAt) : Date.now();
        const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
        const sourcesJson = JSON.stringify(Array.isArray(relatedSources) ? relatedSources : []);
        await db.pool.query(
            `INSERT INTO autofeed_history (
                id, feed_id, guild_id, channel_id, message_id,
                item_guid, item_url, canonical_url, item_title,
                item_author, item_content, tags, is_digest,
                clicks_count, is_expired, clustered_with_id, related_sources,
                is_best_of, sentiment_score, is_pending_approval, approved_by, rejected_by,
                release_date, fact_check_score, posted_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, false, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
            [
                id,
                fId,
                targetGuildId,
                channelId || null,
                messageId || discordMessageId || null,
                guid,
                url,
                canonicalUrl || url,
                title,
                itemAuthor,
                itemContent ? String(itemContent).slice(0, 1000) : null,
                tagsJson,
                Boolean(isDigest),
                clusteredWithId || null,
                sourcesJson,
                Boolean(isBestOf),
                sentimentScore ? String(sentimentScore) : null,
                Boolean(isPendingApproval),
                approvedBy || null,
                rejectedBy || null,
                releaseDate || null,
                factCheckScore !== null && factCheckScore !== undefined ? Number(factCheckScore) : null,
                now
            ]
        );
        return id;
    }

    _mapHistoryRow(row) {
        if (!row) return null;
        let relatedSources = [];
        try {
            relatedSources = typeof row.related_sources === 'string'
                ? JSON.parse(row.related_sources)
                : (row.related_sources || []);
        } catch {
            relatedSources = [];
        }
        let tags = [];
        try {
            tags = typeof row.tags === 'string'
                ? JSON.parse(row.tags)
                : (row.tags || []);
        } catch {
            tags = [];
        }

        return {
            id: row.id,
            feedId: row.feed_id || row.feedId,
            guid: row.guid || row.item_guid,
            link: row.link || row.item_url,
            title: row.title || row.item_title,
            guildId: row.guild_id || row.feed_guild_id || row.guildId,
            channelId: row.channel_id || row.original_channel_id || row.channelId,
            messageId: row.message_id || row.messageId,
            canonicalUrl: row.canonical_url || row.canonicalUrl,
            itemAuthor: row.item_author || row.itemAuthor,
            itemContent: row.item_content || row.itemContent,
            content: row.item_content || row.content,
            summary: row.item_content || row.content,
            tags,
            isDigest: Boolean(row.is_digest),
            clusteredWithId: row.clustered_with_id,
            relatedSources,
            isBestOf: Boolean(row.is_best_of),
            sentimentScore: row.sentiment_score,
            isPendingApproval: Boolean(row.is_pending_approval),
            approvedBy: row.approved_by,
            rejectedBy: row.rejected_by,
            releaseDate: row.release_date || null,
            factCheckScore: row.fact_check_score !== null && row.fact_check_score !== undefined ? Number(row.fact_check_score) : null,
            postedAt: Number(row.posted_at) || Date.now(),
            feedName: row.feed_name
        };
    }

    _mapUserDigestRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            scheduleTime: row.schedule_time,
            isEnabled: Boolean(row.is_enabled),
            lastSentAt: Number(row.last_sent_at) || 0,
            createdAt: Number(row.created_at) || Date.now()
        };
    }

    // ==========================================
    // CLUSTERING & SOURCES MULTIPLES
    // ==========================================
    async getRecentPostedItems(guildId, hoursWindow = 4) {
        await this.initSchema();
        const since = Date.now() - (hoursWindow * 3600 * 1000);
        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name, f.category as feed_category
             FROM autofeed_history h
             JOIN autofeeds f ON h.feed_id = f.id
             WHERE h.guild_id = $1 AND h.posted_at >= $2
             ORDER BY h.posted_at DESC`,
            [guildId, since]
        ).catch(() => ({ rows: [] }));
        return (res.rows || []).map(r => this._mapHistoryRow(r));
    }

    async addRelatedSourceToHistory(historyId, source = {}) {
        await this.initSchema();
        const res = await db.pool.query(`SELECT related_sources FROM autofeed_history WHERE id = $1`, [historyId]);
        if (!res.rows?.[0]) return false;
        let sources = [];
        try {
            sources = typeof res.rows[0].related_sources === 'string'
                ? JSON.parse(res.rows[0].related_sources)
                : (res.rows[0].related_sources || []);
        } catch { sources = []; }

        const entryUrl = source.url || source.link || '#';
        if (!sources.some(s => (s.url || s.link) === entryUrl)) {
            sources.push({
                feedId: source.feedId || null,
                feedName: source.feedName || source.name || 'Autre source',
                title: source.title || 'Article lié',
                link: entryUrl,
                url: entryUrl,
                publishedAt: source.publishedAt || new Date().toISOString()
            });
            await db.pool.query(
                `UPDATE autofeed_history SET related_sources = $2 WHERE id = $1`,
                [historyId, JSON.stringify(sources)]
            );
            return true;
        }
        return false;
    }

    // ==========================================
    // MODÉRATION & APPROBATION
    // ==========================================
    async getHistoryItemById(historyId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name, f.channel_id as original_channel_id, f.guild_id as feed_guild_id
             FROM autofeed_history h
             LEFT JOIN autofeeds f ON h.feed_id = f.id
             WHERE h.id = $1 LIMIT 1`,
            [historyId]
        );
        return this._mapHistoryRow(res.rows?.[0]);
    }

    async getPendingApprovals(guildId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name
             FROM autofeed_history h
             JOIN autofeeds f ON h.feed_id = f.id
             WHERE h.guild_id = $1 AND h.is_pending_approval = true AND h.approved_by IS NULL AND h.rejected_by IS NULL
             ORDER BY h.posted_at DESC`,
            [guildId]
        ).catch(() => ({ rows: [] }));
        return (res.rows || []).map(r => this._mapHistoryRow(r));
    }

    async approvePendingItem(historyId, approvedBy, publicMessageId = null, publicChannelId = null) {
        await this.initSchema();
        await db.pool.query(
            `UPDATE autofeed_history 
             SET is_pending_approval = false, approved_by = $2, message_id = COALESCE($3, message_id), channel_id = COALESCE($4, channel_id)
             WHERE id = $1`,
            [historyId, approvedBy, publicMessageId, publicChannelId]
        );
        return true;
    }

    async rejectPendingItem(historyId, rejectedBy) {
        await this.initSchema();
        await db.pool.query(
            `UPDATE autofeed_history 
             SET is_pending_approval = false, rejected_by = $2
             WHERE id = $1`,
            [historyId, rejectedBy]
        );
        return true;
    }

    // ==========================================
    // MON JOURNAL PRIVÉ (USER DIGEST EN DM)
    // ==========================================
    async setUserDigest(guildId, userId, scheduleTime = '08:00', isEnabled = true) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO autofeed_user_digests (id, guild_id, user_id, schedule_time, is_enabled, last_sent_at, created_at)
             VALUES ($1, $2, $3, $4, $5, 0, $6)
             ON CONFLICT (guild_id, user_id)
             DO UPDATE SET schedule_time = $4, is_enabled = $5`,
            [id, guildId, userId, scheduleTime, Boolean(isEnabled), now]
        );
        return this.getUserDigest(guildId, userId);
    }

    async getUserDigest(guildId, userId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_user_digests WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
            [guildId, userId]
        );
        return this._mapUserDigestRow(res.rows?.[0]);
    }

    async listDueUserDigests(currentTimeStr) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_user_digests 
             WHERE is_enabled = true AND schedule_time = $1`,
            [currentTimeStr]
        ).catch(() => ({ rows: [] }));
        return (res.rows || []).map(r => this._mapUserDigestRow(r));
    }

    async updateUserDigestLastSent(id, timestamp = Date.now()) {
        await this.initSchema();
        await db.pool.query(
            `UPDATE autofeed_user_digests SET last_sent_at = $2 WHERE id = $1`,
            [id, timestamp]
        );
    }

    async getRecentItemsForUserSubscriptions(guildId, userId, hoursWindow = 24) {
        await this.initSchema();
        const since = Date.now() - (hoursWindow * 3600 * 1000);
        const subs = await this.listUserSubscriptions(guildId, userId);
        if (!subs || subs.length === 0) return [];

        const tags = subs.filter(s => s.targetType === 'tag').map(s => s.targetValue.toLowerCase());
        const categories = subs.filter(s => s.targetType === 'category').map(s => s.targetValue.toLowerCase());
        const feedIds = subs.filter(s => s.targetType === 'feed').map(s => s.targetValue);

        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name, f.category as feed_category
             FROM autofeed_history h
             LEFT JOIN autofeeds f ON h.feed_id = f.id
             WHERE h.guild_id = $1 AND h.posted_at >= $2
             ORDER BY h.posted_at DESC
             LIMIT 50`,
            [guildId, since]
        ).catch(() => ({ rows: [] }));

        const matched = (res.rows || []).filter(item => {
            let itemTags = [];
            try { itemTags = typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || []); } catch {}
            itemTags = itemTags.map(t => String(t).toLowerCase());

            if (feedIds.includes(item.feed_id)) return true;
            if (item.feed_category && categories.includes(item.feed_category.toLowerCase())) return true;
            if (tags.some(t => itemTags.includes(t))) return true;
            return false;
        });

        return matched.map(r => this._mapHistoryRow(r));
    }

    async logHistory({
        feedId,
        itemId,
        title,
        link,
        contentSnippet,
        itemTags = [],
        itemCategory = null,
        guildId = null,
        channelId = null,
        messageId = null,
        canonicalUrl = null,
        isDigest = false,
        clusteredWithId = null,
        postedAt = null,
        publishedAt = null
    }) {
        const resolvedPostedAt = postedAt || (publishedAt ? (publishedAt instanceof Date ? publishedAt.getTime() : new Date(publishedAt).getTime()) : null);
        return this.recordPostedItem(feedId, itemId, link, title, {
            guildId,
            channelId,
            messageId,
            canonicalUrl,
            itemAuthor: null,
            itemContent: contentSnippet,
            tags: itemTags,
            isDigest,
            clusteredWithId,
            postedAt: resolvedPostedAt
        });
    }

    async findRecentHistoryForClustering(guildId, maxAgeHours = 6) {
        await this.initSchema();
        const since = Date.now() - (Number(maxAgeHours) * 3600 * 1000);
        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name, f.feed_type
             FROM autofeed_history h
             LEFT JOIN autofeeds f ON h.feed_id = f.id
             WHERE (h.guild_id = $1 OR f.guild_id = $1)
               AND h.posted_at >= $2
             ORDER BY h.posted_at DESC
             LIMIT 100`,
            [guildId, since]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            feedId: r.feed_id,
            guildId: r.guild_id,
            channelId: r.channel_id,
            messageId: r.message_id,
            itemGuid: r.item_guid,
            url: r.item_url,
            canonicalUrl: r.canonical_url || r.item_url,
            title: r.item_title,
            postedAt: Number(r.posted_at || 0)
        }));
    }

    async updateHistoryClustered(id, clusteredWithId) {
        await this.initSchema();
        await db.pool.query(
            `UPDATE autofeed_history SET clustered_with_id = $2 WHERE id = $1`,
            [id, clusteredWithId]
        ).catch(() => {});
    }

    async getExpiredHistory(maxAgeDays = 7) {
        await this.initSchema();
        const cutoff = Date.now() - (Number(maxAgeDays) * 86400 * 1000);
        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name
             FROM autofeed_history h
             LEFT JOIN autofeeds f ON h.feed_id = f.id
             WHERE h.posted_at <= $1
               AND h.is_expired = false
               AND h.message_id IS NOT NULL
               AND h.channel_id IS NOT NULL
             ORDER BY h.posted_at ASC
             LIMIT 100`,
            [cutoff]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            feedId: r.feed_id,
            guildId: r.guild_id,
            channelId: r.channel_id,
            messageId: r.message_id,
            itemGuid: r.item_guid,
            title: r.item_title,
            postedAt: Number(r.posted_at || 0)
        }));
    }

    async markHistoryExpired(id) {
        await this.initSchema();
        await db.pool.query(
            `UPDATE autofeed_history SET is_expired = true WHERE id = $1`,
            [id]
        ).catch(() => {});
    }

    async updateHistoryBestOf(id, isBestOf = true) {
        await this.initSchema();
        await db.pool.query(
            `UPDATE autofeed_history SET is_best_of = $2 WHERE id = $1`,
            [id, Boolean(isBestOf)]
        ).catch(() => {});
    }

    async recordPriceHistory({
        feedId,
        itemUrl,
        itemTitle = null,
        originalPrice = null,
        currentPrice = null,
        discountPercent = 0,
        currency = 'EUR',
        isAllTimeLow = false,
        recordedAt = null
    }) {
        await this.initSchema();
        const id = newId();
        const now = recordedAt ? Number(recordedAt) : Date.now();
        await db.pool.query(
            `INSERT INTO autofeed_price_history (
                id, feed_id, item_url, item_title,
                original_price, current_price, discount_percent,
                currency, is_all_time_low, recorded_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                id,
                feedId,
                itemUrl,
                itemTitle,
                originalPrice,
                currentPrice,
                Number(discountPercent || 0),
                currency || 'EUR',
                Boolean(isAllTimeLow),
                now
            ]
        ).catch(() => {});
        return id;
    }

    async getPriceHistory(itemUrl, limit = 20) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_price_history WHERE item_url = $1 ORDER BY recorded_at DESC LIMIT $2`,
            [itemUrl, limit]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            feedId: r.feed_id,
            itemUrl: r.item_url,
            itemTitle: r.item_title,
            originalPrice: r.original_price,
            currentPrice: r.current_price,
            discountPercent: Number(r.discount_percent || 0),
            currency: r.currency || 'EUR',
            isAllTimeLow: Boolean(r.is_all_time_low),
            recordedAt: Number(r.recorded_at || 0)
        }));
    }

    async getLowestHistoricalPrice(itemUrl) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_price_history WHERE item_url = $1 ORDER BY recorded_at ASC`,
            [itemUrl]
        );
        if (!res.rows || res.rows.length === 0) return null;
        let lowest = null;
        for (const row of res.rows) {
            const num = parseFloat(String(row.current_price || '').replace(',', '.').replace(/[^0-9.]/g, ''));
            if (!isNaN(num)) {
                if (lowest === null || num < lowest.amount) {
                    lowest = { amount: num, raw: row.current_price, row };
                }
            }
        }
        return lowest;
    }

    async getHistory(feedId, limit = 10) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_history WHERE feed_id = $1 ORDER BY posted_at DESC LIMIT $2`,
            [feedId, limit]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            feedId: r.feed_id,
            title: r.item_title,
            link: r.item_url,
            url: r.item_url,
            contentSnippet: r.item_content,
            tags: (() => { try { return JSON.parse(r.tags || '[]'); } catch { return []; } })(),
            isBestOf: Boolean(r.is_best_of),
            postedAt: Number(r.posted_at || 0)
        }));
    }

    async listActive() {
        return this.listAllActive();
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
        let autoReactions = [];
        let autoPoll = {};
        let breakingKeywords = [];
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

        try {
            autoReactions = typeof row.auto_reactions === 'string' ? JSON.parse(row.auto_reactions) : (row.auto_reactions || []);
        } catch { autoReactions = []; }

        try {
            autoPoll = typeof row.auto_poll === 'string' ? JSON.parse(row.auto_poll) : (row.auto_poll || {});
        } catch { autoPoll = {}; }

        try {
            breakingKeywords = typeof row.breaking_keywords === 'string' ? JSON.parse(row.breaking_keywords) : (row.breaking_keywords || []);
        } catch { breakingKeywords = []; }

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
            autoReactions: Array.isArray(autoReactions) ? autoReactions : [],
            autoPoll: autoPoll || {},
            breakingKeywords: Array.isArray(breakingKeywords) ? breakingKeywords : [],
            bypassQuietHours: Boolean(row.bypass_quiet_hours),
            breakingRoleId: row.breaking_role_id || null,
            autoExpireDays: Number(row.auto_expire_days || 0),
            enableAudioBriefing: Boolean(row.enable_audio_briefing),
            enableVoting: Boolean(row.enable_voting),
            bestOfThreshold: Number(row.best_of_threshold || 5),
            bestOfChannelId: row.best_of_channel_id || null,
            minDiscountPercent: Number(row.min_discount_percent || 0),
            autoSyncEvents: Boolean(row.auto_sync_events),
            goodVibesOnly: Boolean(row.good_vibes_only),
            enableSecurityScan: row.enable_security_scan !== false,
            translateTitleToFr: Boolean(row.translate_title_to_fr),
            antiClickbait: Boolean(row.anti_clickbait),
            requireApproval: Boolean(row.require_approval),
            moderationChannelId: row.moderation_channel_id || null,
            enableStoryClustering: Boolean(row.enable_story_clustering),
            clusterMode: row.cluster_mode || 'merge',
            enableVideoSummary: Boolean(row.enable_video_summary),
            autoSmartTag: Boolean(row.auto_smart_tag),
            syncToKnowledgeBase: Boolean(row.sync_to_knowledge_base),
            knowledgeBaseType: row.knowledge_base_type || 'markdown',
            knowledgeWebhookUrl: row.knowledge_webhook_url || null,
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

    _mapReleaseReminderRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            historyId: row.history_id || null,
            itemTitle: row.item_title,
            itemUrl: row.item_url,
            targetDate: row.target_date,
            releaseDate: row.target_date,
            feedName: row.feed_name || null,
            isNotified: Boolean(row.is_notified),
            notifiedAt: row.notified_at ? Number(row.notified_at) : null,
            createdAt: Number(row.created_at) || Date.now()
        };
    }

    _mapTriviaQuizRow(row) {
        if (!row) return null;
        let options = [];
        try { options = typeof row.options === 'string' ? JSON.parse(row.options) : (row.options || []); } catch {}
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            messageId: row.message_id,
            theme: row.theme || 'Actualités de la Semaine',
            question: row.question,
            options,
            correctOptionIndex: Number(row.correct_option_index),
            correctIndex: Number(row.correct_option_index),
            explanation: row.explanation,
            sourceUrl: row.source_url,
            xpReward: Number(row.xp_reward || 50),
            isActive: Boolean(row.is_active),
            createdAt: Number(row.created_at) || Date.now()
        };
    }

    _mapTriviaAnswerRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            quizId: row.quiz_id,
            userId: row.user_id,
            guildId: row.guild_id,
            selectedOptionIndex: Number(row.selected_option_index),
            selectedIndex: Number(row.selected_option_index),
            isCorrect: Boolean(row.is_correct),
            xpEarned: Number(row.xp_earned || 0),
            answeredAt: Number(row.answered_at) || Date.now()
        };
    }

    _mapPredictionRow(row) {
        if (!row) return null;
        let options = [];
        try { options = typeof row.options === 'string' ? JSON.parse(row.options) : (row.options || []); } catch {}
        return {
            id: row.id,
            guildId: row.guild_id,
            feedId: row.feed_id,
            historyId: row.history_id,
            title: row.title,
            description: row.description,
            sourceUrl: row.source_url,
            options,
            status: row.status || 'open',
            resolvedOptionIndex: row.resolved_option_index !== null && row.resolved_option_index !== undefined ? Number(row.resolved_option_index) : null,
            winningOptionIndex: row.resolved_option_index !== null && row.resolved_option_index !== undefined ? Number(row.resolved_option_index) : null,
            totalPoolXp: Number(row.total_pool_xp || 0),
            closesAt: row.closes_at ? Number(row.closes_at) : null,
            resolvedAt: row.resolved_at ? Number(row.resolved_at) : null,
            createdAt: Number(row.created_at) || Date.now()
        };
    }

    _mapPredictionBetRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            predictionId: row.prediction_id,
            guildId: row.guild_id,
            userId: row.user_id,
            optionIndex: Number(row.option_index),
            amountXp: Number(row.amount_xp),
            payoutXp: Number(row.payout_xp || 0),
            isClaimed: Boolean(row.is_claimed),
            createdAt: Number(row.created_at) || Date.now()
        };
    }

    // ==========================================
    // RAPPELS DE SORTIE DE JEUX (« JOUR J »)
    // ==========================================
    async addReleaseReminder({ guildId, userId, historyId = null, itemTitle, itemUrl, targetDate, releaseDate, reminderNote = null, feedName = null }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        const finalDate = targetDate || releaseDate;
        await db.pool.query(
            `INSERT INTO autofeed_release_reminders (
                id, guild_id, user_id, history_id, item_title, item_url, target_date, is_notified, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)`,
            [id, guildId, userId, historyId || null, itemTitle, itemUrl || null, finalDate, now]
        );
        return this.getReleaseReminderById(id);
    }

    async getReleaseReminderById(id) {
        await this.initSchema();
        const res = await db.pool.query(`SELECT * FROM autofeed_release_reminders WHERE id = $1 LIMIT 1`, [id]);
        return this._mapReleaseReminderRow(res.rows?.[0]);
    }

    async listDueReleaseReminders(targetDate = null) {
        await this.initSchema();
        const dateLimit = targetDate || new Date().toISOString().slice(0, 10);
        const res = await db.pool.query(
            `SELECT * FROM autofeed_release_reminders
             WHERE is_notified = false AND target_date <= $1
             ORDER BY created_at ASC`,
            [dateLimit]
        ).catch(() => ({ rows: [] }));
        return (res.rows || []).map(r => this._mapReleaseReminderRow(r));
    }

    async markReleaseReminderNotified(id) {
        await this.initSchema();
        const now = Date.now();
        await db.pool.query(
            `UPDATE autofeed_release_reminders SET is_notified = true, notified_at = $2 WHERE id = $1`,
            [id, now]
        );
    }

    async getUserReleaseReminders(userId, guildId = null) {
        await this.initSchema();
        let query = `SELECT * FROM autofeed_release_reminders WHERE user_id = $1`;
        const params = [userId];
        if (guildId) {
            query += ` AND (guild_id = $2 OR guild_id IS NULL)`;
            params.push(guildId);
        }
        query += ` ORDER BY created_at DESC`;
        const res = await db.pool.query(query, params).catch(() => ({ rows: [] }));
        return (res.rows || []).map(r => this._mapReleaseReminderRow(r));
    }

    // ==========================================
    // QUIZ TRIVIA HEBDOMADAIRE
    // ==========================================
    async createTriviaQuiz({ guildId, channelId = null, messageId = null, theme = 'Actualités de la Semaine', question, options = [], correctOptionIndex = 0, correctIndex = 0, explanation = '', sourceUrl = null, xpReward = 50 }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        const optionsJson = JSON.stringify(Array.isArray(options) ? options : []);
        const finalCorrect = correctOptionIndex !== undefined ? correctOptionIndex : correctIndex;
        await db.pool.query(
            `INSERT INTO autofeed_trivia_quizzes (
                id, guild_id, channel_id, message_id, theme, question, options, correct_option_index, explanation, source_url, xp_reward, is_active, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)`,
            [id, guildId, channelId, messageId, theme, question, optionsJson, finalCorrect, explanation, sourceUrl, xpReward, now]
        );
        return this.getTriviaQuizById(id);
    }

    async getTriviaQuizById(id) {
        await this.initSchema();
        const res = await db.pool.query(`SELECT * FROM autofeed_trivia_quizzes WHERE id = $1 LIMIT 1`, [id]);
        return this._mapTriviaQuizRow(res.rows?.[0]);
    }

    async getActiveTriviaQuiz(guildId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_trivia_quizzes WHERE guild_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
            [guildId]
        ).catch(() => ({ rows: [] }));
        return this._mapTriviaQuizRow(res.rows?.[0]);
    }

    async recordTriviaAnswer({ quizId, userId, guildId, selectedOptionIndex, selectedIndex, isCorrect, xpEarned = 0 }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        const finalIndex = selectedOptionIndex !== undefined ? selectedOptionIndex : selectedIndex;
        await db.pool.query(
            `INSERT INTO autofeed_trivia_answers (
                id, quiz_id, user_id, guild_id, selected_option_index, is_correct, xp_earned, answered_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (quiz_id, user_id) DO NOTHING`,
            [id, quizId, userId, guildId, finalIndex, Boolean(isCorrect), xpEarned, now]
        );
        return { ok: true, isCorrect, xpEarned };
    }

    async hasUserAnsweredTrivia(quizId, userId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT id FROM autofeed_trivia_answers WHERE quiz_id = $1 AND user_id = $2 LIMIT 1`,
            [quizId, userId]
        ).catch(() => ({ rows: [] }));
        return Boolean(res.rows?.[0]);
    }

    // ==========================================
    // MARCHÉ DE PRÉDICTIONS & PARIS EN XP
    // ==========================================
    async createPrediction({ guildId, feedId = null, historyId = null, title, description = null, sourceUrl = null, options = ['Oui', 'Non'], closesAtHours = 48 }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        const closesAt = now + (closesAtHours * 3600 * 1000);
        const optionsJson = JSON.stringify(Array.isArray(options) ? options : ['Oui', 'Non']);
        await db.pool.query(
            `INSERT INTO autofeed_predictions (
                id, guild_id, feed_id, history_id, title, description, source_url, options, status, total_pool_xp, closes_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', 0, $9, $10)`,
            [id, guildId, feedId, historyId, title, description, sourceUrl, optionsJson, closesAt, now]
        );
        return this.getPredictionById(id);
    }

    async getPredictionById(id) {
        await this.initSchema();
        const res = await db.pool.query(`SELECT * FROM autofeed_predictions WHERE id = $1 LIMIT 1`, [id]);
        return this._mapPredictionRow(res.rows?.[0]);
    }

    async listPredictions(guildId, status = null) {
        await this.initSchema();
        let query = `SELECT * FROM autofeed_predictions WHERE guild_id = $1`;
        const params = [guildId];
        if (status) {
            query += ` AND status = $2`;
            params.push(status);
        }
        query += ` ORDER BY created_at DESC LIMIT 20`;
        const res = await db.pool.query(query, params).catch(() => ({ rows: [] }));
        return (res.rows || []).map(r => this._mapPredictionRow(r));
    }

    async placePredictionBet({ predictionId, guildId, userId, optionIndex, amountXp }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO autofeed_prediction_bets (
                id, prediction_id, guild_id, user_id, option_index, amount_xp, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, predictionId, guildId, userId, optionIndex, amountXp, now]
        );
        await db.pool.query(
            `UPDATE autofeed_predictions SET total_pool_xp = total_pool_xp + $2 WHERE id = $1`,
            [predictionId, amountXp]
        );
        return { ok: true, betId: id };
    }

    async listPredictionBets(predictionId) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT * FROM autofeed_prediction_bets WHERE prediction_id = $1 ORDER BY created_at ASC`,
            [predictionId]
        ).catch(() => ({ rows: [] }));
        return (res.rows || []).map(r => this._mapPredictionBetRow(r));
    }

    async resolvePrediction(id, resolvedOptionIndex) {
        await this.initSchema();
        const now = Date.now();
        const pred = await this.getPredictionById(id);
        if (!pred) throw new Error('Prédiction introuvable.');

        const bets = await this.listPredictionBets(id);
        const winningBets = bets.filter(b => b.optionIndex === resolvedOptionIndex);
        const totalWinningAmount = winningBets.reduce((acc, b) => acc + b.amountXp, 0);

        if (totalWinningAmount > 0 && pred.totalPoolXp > 0) {
            for (const winBet of winningBets) {
                const ratio = winBet.amountXp / totalWinningAmount;
                const payout = Math.floor(ratio * pred.totalPoolXp);
                await db.pool.query(
                    `UPDATE autofeed_prediction_bets SET payout_xp = $2 WHERE id = $1`,
                    [winBet.id, payout]
                );
            }
        }

        await db.pool.query(
            `UPDATE autofeed_predictions SET status = 'resolved', resolved_option_index = $2, resolved_at = $3 WHERE id = $1`,
            [id, resolvedOptionIndex, now]
        );

        return this.getPredictionById(id);
    }

    async listRecentHistory(guildId, limit = 15) {
        await this.initSchema();
        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name
             FROM autofeed_history h
             LEFT JOIN autofeeds f ON h.feed_id = f.id
             WHERE (h.guild_id = $1 OR f.guild_id = $1)
             ORDER BY h.posted_at DESC
             LIMIT $2`,
            [guildId, limit]
        ).catch(() => ({ rows: [] }));
        return (res.rows || []).map(r => this._mapHistoryRow(r));
    }

    async searchHistoryByTopic(guildId, topic, limit = 20) {
        await this.initSchema();
        const term = `%${(topic || '').trim().toLowerCase()}%`;
        const res = await db.pool.query(
            `SELECT h.*, f.name as feed_name
             FROM autofeed_history h
             LEFT JOIN autofeeds f ON h.feed_id = f.id
             WHERE (h.guild_id = $1 OR f.guild_id = $1)
               AND (LOWER(h.item_title) LIKE $2 OR LOWER(h.item_content) LIKE $2 OR LOWER(h.tags) LIKE $2)
             ORDER BY h.posted_at ASC
             LIMIT $3`,
            [guildId, term, limit]
        ).catch(() => ({ rows: [] }));
        return (res.rows || []).map(r => this._mapHistoryRow(r));
    }
}

const autofeedsRepository = new AutofeedsRepository();

module.exports = { AutofeedsRepository, autofeedsRepository };
