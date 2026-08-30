/**
 * src/modules/util_server_stats/services/server-stats.repository.js
 *
 * Couche BDD pour les salons statistiques et statroles du serveur (P5).
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class ServerStatsRepository {
    async registerChannel({ guildId, channelId, statType, format, targetId = null, timezone = null }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO server_stats_channels (id, guild_id, channel_id, stat_type, format, target_id, timezone, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
             ON CONFLICT (guild_id, channel_id)
             DO UPDATE SET stat_type = EXCLUDED.stat_type, format = EXCLUDED.format, target_id = EXCLUDED.target_id, timezone = EXCLUDED.timezone, updated_at = EXCLUDED.updated_at`,
            [id, guildId, channelId, statType, format, targetId, timezone, now]
        );

        return this.getChannel(guildId, channelId);
    }

    async getChannel(guildId, channelId) {
        const res = await db.pool.query(
            `SELECT * FROM server_stats_channels WHERE guild_id = $1 AND channel_id = $2 LIMIT 1`,
            [guildId, channelId]
        );
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async listChannels(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM server_stats_channels WHERE guild_id = $1 ORDER BY created_at ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async deleteChannel(guildId, channelId) {
        await db.pool.query(
            `DELETE FROM server_stats_channels WHERE guild_id = $1 AND channel_id = $2`,
            [guildId, channelId]
        );
    }

    // =================== STATROLES ===================

    async addStatrole({ guildId, roleId, type, threshold }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO statroles (id, guild_id, role_id, type, threshold, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (guild_id, role_id, type)
             DO UPDATE SET threshold = EXCLUDED.threshold`,
            [id, guildId, roleId, type, threshold, now]
        );

        return { id, guildId, roleId, type, threshold, createdAt: now };
    }

    async listStatroles(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM statroles WHERE guild_id = $1 ORDER BY threshold ASC`,
            [guildId]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            guildId: r.guild_id,
            roleId: r.role_id,
            type: r.type,
            threshold: Number(r.threshold),
            createdAt: Number(r.created_at || 0)
        }));
    }

    async deleteStatrole(guildId, idOrRole) {
        await db.pool.query(
            `DELETE FROM statroles WHERE guild_id = $1 AND (id = $2 OR role_id = $2)`,
            [guildId, idOrRole]
        );
    }

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            statType: row.stat_type,
            format: row.format,
            targetId: row.target_id || null,
            timezone: row.timezone || null,
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { ServerStatsRepository };
