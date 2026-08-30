/**
 * src/modules/util_autofeeds/services/autofeeds.repository.js
 *
 * Couche BDD pour les flux automatiques (Autofeeds).
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class AutofeedsRepository {
    async addFeed({ guildId, channelId, feedUrl, feedType = 'rss', intervalMinutes = 15 }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO autofeeds (id, guild_id, channel_id, feed_url, feed_type, interval_minutes, enabled, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
            [id, guildId, channelId, feedUrl.trim(), feedType, intervalMinutes, now]
        );

        return this.getFeedById(id);
    }

    async getFeedById(id) {
        const res = await db.pool.query(`SELECT * FROM autofeeds WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async listByGuild(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM autofeeds WHERE guild_id = $1 ORDER BY created_at ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async listAllActive() {
        const res = await db.pool.query(`SELECT * FROM autofeeds WHERE enabled = true`);
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async updateLastItem(id, lastItemId, lastItemPublishedAt) {
        await db.pool.query(
            `UPDATE autofeeds SET last_item_id = $2, last_item_published_at = $3 WHERE id = $1`,
            [id, lastItemId, lastItemPublishedAt]
        );
    }

    async deleteFeed(id) {
        await db.pool.query(`DELETE FROM autofeeds WHERE id = $1`, [id]);
    }

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            feedUrl: row.feed_url,
            feedType: row.feed_type,
            lastItemId: row.last_item_id,
            lastItemPublishedAt: Number(row.last_item_published_at || 0),
            intervalMinutes: Number(row.interval_minutes || 15),
            enabled: Boolean(row.enabled),
            createdAt: Number(row.created_at || 0)
        };
    }
}

module.exports = { AutofeedsRepository };
