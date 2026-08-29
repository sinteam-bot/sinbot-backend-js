/**
 * giveaways.repository.js
 */
const { db } = require('../../../db/index.js');

function safeParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

class GiveawaysRepository {
    // =================== GIVEAWAYS ===================

    async insertGiveaway(g) {
        await db.pool.query(
            `INSERT INTO giveaways (id, guild_id, channel_id, message_id, host_id, prize, description, winners_count, required_role_id, starts_at, ends_at, status, winners_json, color, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [g.id, g.guildId, g.channelId, g.messageId || null, g.hostId, g.prize, g.description || null, g.winnersCount, g.requiredRoleId || null, g.startsAt, g.endsAt, g.status || 'active', g.winnersJson || null, g.color || null, g.createdAt, g.updatedAt]
        );
        return g;
    }

    async updateGiveaway(id, fields) {
        const allowed = ['message_id', 'status', 'winners_json', 'updated_at'];
        const setSql = [];
        const params = [];
        let i = 1;
        for (const key of allowed) {
            if (fields[key === 'message_id' ? 'messageId' : key === 'status' ? 'status' : key === 'winners_json' ? 'winnersJson' : 'updatedAt'] !== undefined) {
                const val = key === 'winners_json' ? JSON.stringify(fields.winnersJson) :
                            key === 'updated_at' ? Date.now() :
                            fields[key === 'message_id' ? 'messageId' : 'status'];
                setSql.push(`${key} = $${i++}`);
                params.push(val);
            }
        }
        if (setSql.length === 0) return null;
        params.push(id);
        await db.pool.query(
            `UPDATE giveaways SET ${setSql.join(', ')} WHERE id = $${i}`,
            params
        );
        return this.getGiveaway(id);
    }

    async getGiveaway(id) {
        const res = await db.pool.query(`SELECT * FROM giveaways WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapGiveaway(res.rows[0]) : null;
    }

    async getGiveawayByMessageId(messageId) {
        const res = await db.pool.query(`SELECT * FROM giveaways WHERE message_id = $1 LIMIT 1`, [messageId]);
        return res.rows?.[0] ? this._mapGiveaway(res.rows[0]) : null;
    }

    async listGiveawaysByChannel(channelId) {
        const res = await db.pool.query(
            `SELECT * FROM giveaways WHERE channel_id = $1 AND status = 'active' ORDER BY ends_at ASC`,
            [channelId]
        );
        return (res.rows || []).map(r => this._mapGiveaway(r));
    }

    async listGiveaways(guildId, status = null) {
        const params = [guildId];
        let where = `guild_id = $1`;
        if (status) { where += ` AND status = $2`; params.push(status); }
        const res = await db.pool.query(
            `SELECT * FROM giveaways WHERE ${where} ORDER BY ends_at ASC`,
            params
        );
        return (res.rows || []).map(r => this._mapGiveaway(r));
    }

    async findDueGiveaways(now, limit = 20) {
        const res = await db.pool.query(
            `SELECT * FROM giveaways WHERE status = 'active' AND ends_at <= $1 ORDER BY ends_at ASC LIMIT $2`,
            [now, limit]
        );
        return (res.rows || []).map(r => this._mapGiveaway(r));
    }

    // =================== ENTRIES ===================

    async insertEntry(giveawayId, userId) {
        await db.pool.query(
            `INSERT INTO giveaway_entries (giveaway_id, user_id, entered_at) VALUES ($1, $2, $3)
             ON CONFLICT (giveaway_id, user_id) DO NOTHING`,
            [giveawayId, userId, Date.now()]
        );
    }

    async deleteEntry(giveawayId, userId) {
        await db.pool.query(
            `DELETE FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2`,
            [giveawayId, userId]
        );
    }

    async hasEntry(giveawayId, userId) {
        const res = await db.pool.query(
            `SELECT 1 FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2 LIMIT 1`,
            [giveawayId, userId]
        );
        return res.rows?.length > 0;
    }

    async countEntries(giveawayId) {
        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM giveaway_entries WHERE giveaway_id = $1`,
            [giveawayId]
        );
        return res.rows?.[0]?.count || 0;
    }

    _mapGiveaway(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            messageId: row.message_id,
            hostId: row.host_id,
            prize: row.prize,
            description: row.description,
            winnersCount: row.winners_count,
            requiredRoleId: row.required_role_id,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            status: row.status,
            winners: row.winners_json ? safeParse(row.winners_json, []) : [],
            color: row.color,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

module.exports = { GiveawaysRepository };
