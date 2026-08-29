/**
 * giveaways.repository.js
 */
const { db } = require('../../../db/index.js');
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
        for (const [k, v] of Object.entries(fields)) {
            const col = k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            if (allowed.includes(col)) {
                params.push(v);
                setSql.push(`${col} = $${params.length}`);
            }
        }
        if (setSql.length === 0) return;
        params.push(id);
        await db.pool.query(
            `UPDATE giveaways SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
    }

    async findGiveawayById(id) {
        const res = await db.pool.query(`SELECT * FROM giveaways WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapGiveaway(res.rows[0]) : null;
    }

    async findGiveawayByMessageId(messageId) {
        const res = await db.pool.query(`SELECT * FROM giveaways WHERE message_id = $1 LIMIT 1`, [messageId]);
        return res.rows?.[0] ? this._mapGiveaway(res.rows[0]) : null;
    }

    async findGiveawayByChannelId(channelId, status = null) {
        const where = ['channel_id = $1'];
        const params = [channelId];
        if (status) { params.push(status); where.push(`status = $${params.length}`); }
        const res = await db.pool.query(
            `SELECT * FROM giveaways WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 1`,
            params
        );
        return res.rows?.[0] ? this._mapGiveaway(res.rows[0]) : null;
    }

    async listGiveaways({ guildId, status, limit = 50, offset = 0 } = {}) {
        const where = [];
        const args = [];
        if (guildId) { args.push(guildId); where.push(`guild_id = $${args.length}`); }
        if (status) { args.push(status); where.push(`status = $${args.length}`); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        args.push(limit, offset);
        const res = await db.pool.query(
            `SELECT * FROM giveaways ${whereSql} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
            args
        );
        return (res.rows || []).map(r => this._mapGiveaway(r));
    }

    async findDueGiveaways(limit = 50) {
        const now = Date.now();
        const res = await db.pool.query(
            `SELECT * FROM giveaways WHERE status = 'active' AND ends_at <= $1 ORDER BY ends_at ASC LIMIT $2`,
            [now, limit]
        );
        return (res.rows || []).map(r => this._mapGiveaway(r));
    }

    async addEntry(giveawayId, userId) {
        const now = Date.now();
        try {
            await db.pool.query(
                `INSERT INTO giveaway_entries (giveaway_id, user_id, entered_at) VALUES ($1, $2, $3)`,
                [giveawayId, userId, now]
            );
            return true;
        } catch (err) {
            return false; // duplicate PK
        }
    }

    async removeEntry(giveawayId, userId) {
        const res = await db.pool.query(
            `DELETE FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2`,
            [giveawayId, userId]
        );
        return res.rowCount || 0;
    }

    async listEntries(giveawayId) {
        const res = await db.pool.query(
            `SELECT * FROM giveaway_entries WHERE giveaway_id = $1 ORDER BY entered_at ASC`,
            [giveawayId]
        );
        return res.rows || [];
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
function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
module.exports = { GiveawaysRepository };