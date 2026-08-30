/**
 * src/modules/util_server_stats/services/server-stats.repository.js
 *
 * Couche BDD pour les salons statistiques du serveur.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class ServerStatsRepository {
    async registerChannel({ guildId, channelId, statType, format }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO server_stats_channels (id, guild_id, channel_id, stat_type, format, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $6)
             ON CONFLICT (guild_id, channel_id)
             DO UPDATE SET stat_type = EXCLUDED.stat_type, format = EXCLUDED.format, updated_at = EXCLUDED.updated_at`,
            [id, guildId, channelId, statType, format, now]
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

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            statType: row.stat_type,
            format: row.format,
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { ServerStatsRepository };
