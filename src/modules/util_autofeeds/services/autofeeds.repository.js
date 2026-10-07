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
                    "created_at" bigint NOT NULL,
                    CONSTRAINT "autofeed_subs_unique" UNIQUE("guild_id", "user_id", "target_type", "target_value")
                );
            `);

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
                ping_role_id, interval_minutes, enabled, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, $14)`,
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
                interval_minutes = $12,
                enabled = $13,
                updated_at = $14
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

    async addSubscription({ guildId, userId, targetType, targetValue, notifyMode = 'mention' }) {
        await this.initSchema();
        const id = newId();
        const now = Date.now();
        const normalizedTarget = (targetValue || '').trim().toLowerCase();

        await db.pool.query(
            `INSERT INTO autofeed_subscriptions (id, guild_id, user_id, target_type, target_value, notify_mode, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (guild_id, user_id, target_type, target_value)
             DO UPDATE SET notify_mode = EXCLUDED.notify_mode`,
            [id, guildId, userId, targetType, normalizedTarget, notifyMode, now]
        );

        return {
            id,
            guildId,
            userId,
            targetType,
            targetValue: normalizedTarget,
            notifyMode,
            createdAt: now
        };
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
            name: row.name || null,
            feedType: row.feed_type || 'rss',
            category: row.category || 'general',
            tags: Array.isArray(tags) ? tags : [],
            filters: filters || {},
            customMessage: row.custom_message || null,
            color: row.color || '#FF4500',
            pingRoleId: row.ping_role_id || null,
            lastItemId: row.last_item_id,
            lastItemPublishedAt: Number(row.last_item_published_at || 0),
            intervalMinutes: Number(row.interval_minutes || 15),
            enabled: Boolean(row.enabled),
            createdAt: Number(row.created_at || 0),
            updatedAt: row.updated_at ? Number(row.updated_at) : null
        };
    }

    _mapSubRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            targetType: row.target_type,
            targetValue: row.target_value,
            notifyMode: row.notify_mode || 'mention',
            createdAt: Number(row.created_at || 0)
        };
    }
}

module.exports = { AutofeedsRepository };
