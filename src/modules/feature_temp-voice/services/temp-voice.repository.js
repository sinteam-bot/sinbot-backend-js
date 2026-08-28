/**
 * temp-voice.repository.js — couche d'accès BDD
 */

const { db } = require('../../../db/index.js');

function safeParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

class TempVoiceRepository {
    // =================== CONFIG ===================

    async getConfig(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM temp_voice_config WHERE guild_id = $1 LIMIT 1`,
            [guildId]
        );
        return res.rows?.[0] ? this._mapConfig(res.rows[0]) : null;
    }

    async upsertConfig(c) {
        const now = Date.now();
        const joinChannelsJson = c.joinChannels ? JSON.stringify(c.joinChannels) : null;
        await db.pool.query(
            `INSERT INTO temp_voice_config
             (guild_id, category_id, format, delete_delay_seconds, max_per_guild, locked_role_id, join_channels_json, enabled, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (guild_id) DO UPDATE SET
               category_id = EXCLUDED.category_id,
               format = EXCLUDED.format,
               delete_delay_seconds = EXCLUDED.delete_delay_seconds,
               max_per_guild = EXCLUDED.max_per_guild,
               locked_role_id = EXCLUDED.locked_role_id,
               join_channels_json = EXCLUDED.join_channels_json,
               enabled = EXCLUDED.enabled,
               updated_at = EXCLUDED.updated_at`,
            [c.guildId, c.categoryId || null, c.format || "{user}'s game", c.deleteDelaySeconds ?? 5, c.maxPerGuild ?? 0, c.lockedRoleId || null, joinChannelsJson, c.enabled ? 1 : 0, now]
        );
        return this.getConfig(c.guildId);
    }

    // =================== STATE ===================

    async insertState(s) {
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO temp_voice_state
             (channel_id, guild_id, creator_id, last_empty_at, created_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (channel_id) DO UPDATE SET
               last_empty_at = EXCLUDED.last_empty_at`,
            [s.channelId, s.guildId, s.creatorId || null, s.lastEmptyAt ?? 0, s.createdAt || now]
        );
    }

    async getState(channelId) {
        const res = await db.pool.query(
            `SELECT * FROM temp_voice_state WHERE channel_id = $1 LIMIT 1`,
            [channelId]
        );
        return res.rows?.[0] ? this._mapState(res.rows[0]) : null;
    }

    async deleteState(channelId) {
        await db.pool.query(`DELETE FROM temp_voice_state WHERE channel_id = $1`, [channelId]);
    }

    async listActiveStates(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM temp_voice_state WHERE guild_id = $1 ORDER BY created_at DESC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapState(r));
    }

    async listStatesEmptySince(guildId, beforeMs) {
        const res = await db.pool.query(
            `SELECT * FROM temp_voice_state WHERE guild_id = $1 AND last_empty_at > 0 AND last_empty_at <= $2`,
            [guildId, beforeMs]
        );
        return (res.rows || []).map(r => this._mapState(r));
    }

    async countByGuild(guildId) {
        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM temp_voice_state WHERE guild_id = $1`,
            [guildId]
        );
        return res.rows?.[0]?.count || 0;
    }

    // =================== MAP ===================

    _mapConfig(row) {
        return {
            guildId: row.guild_id,
            categoryId: row.category_id,
            format: row.format,
            deleteDelaySeconds: row.delete_delay_seconds,
            maxPerGuild: row.max_per_guild,
            lockedRoleId: row.locked_role_id,
            joinChannels: safeParse(row.join_channels_json, []),
            enabled: !!row.enabled,
            updatedAt: row.updated_at
        };
    }

    _mapState(row) {
        return {
            channelId: row.channel_id,
            guildId: row.guild_id,
            creatorId: row.creator_id,
            lastEmptyAt: row.last_empty_at,
            createdAt: row.created_at
        };
    }
}

module.exports = { TempVoiceRepository };
