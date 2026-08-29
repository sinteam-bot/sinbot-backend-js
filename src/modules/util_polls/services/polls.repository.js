/**
 * polls.repository.js
 */
const { db } = require('../../../db/index.js');
class PollsRepository {
    // =================== POLLS ===================

    async insertPoll(p) {
        await db.pool.query(
            `INSERT INTO polls (id, guild_id, channel_id, message_id, question, options_json, multi_choice, anonymous, ends_at, status, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [p.id, p.guildId, p.channelId, p.messageId || null, p.question, JSON.stringify(p.options || []), p.multiChoice ? 1 : 0, p.anonymous ? 1 : 0, p.endsAt || null, p.status || 'active', p.createdBy, p.createdAt]
        );
        return p;
    }

    async updatePoll(id, fields) {
        const allowed = ['message_id', 'status', 'ends_at'];
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
            `UPDATE polls SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
    }

    async findPollById(id) {
        const res = await db.pool.query(`SELECT * FROM polls WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapPoll(res.rows[0]) : null;
    }

    async findPollByMessageId(messageId) {
        const res = await db.pool.query(`SELECT * FROM polls WHERE message_id = $1 LIMIT 1`, [messageId]);
        return res.rows?.[0] ? this._mapPoll(res.rows[0]) : null;
    }

    async listPolls({ guildId, status, limit = 50, offset = 0 } = {}) {
        const where = [];
        const args = [];
        if (guildId) { args.push(guildId); where.push(`guild_id = $${args.length}`); }
        if (status) { args.push(status); where.push(`status = $${args.length}`); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        args.push(limit, offset);
        const res = await db.pool.query(
            `SELECT * FROM polls ${whereSql} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
            args
        );
        return (res.rows || []).map(r => this._mapPoll(r));
    }

    async addVote(pollId, userId, optionIndex) {
        const now = Date.now();
        try {
            await db.pool.query(
                `INSERT INTO poll_votes (poll_id, user_id, option_index, voted_at) VALUES ($1, $2, $3, $4)`,
                [pollId, userId, optionIndex, now]
            );
            return true;
        } catch (err) {
            return false;
        }
    }

    async removeVotesForUser(pollId, userId) {
        const res = await db.pool.query(
            `DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2`,
            [pollId, userId]
        );
        return res.rowCount || 0;
    }

    async tallyVotes(pollId) {
        const res = await db.pool.query(
            `SELECT option_index, COUNT(*)::int AS count FROM poll_votes WHERE poll_id = $1 GROUP BY option_index ORDER BY option_index ASC`,
            [pollId]
        );
        return res.rows || [];
    }

    async hasUserVoted(pollId, userId) {
        const res = await db.pool.query(
            `SELECT 1 FROM poll_votes WHERE poll_id = $1 AND user_id = $2 LIMIT 1`,
            [pollId, userId]
        );
        return (res.rows || []).length > 0;
    }

    async getUserVotes(pollId, userId) {
        const res = await db.pool.query(
            `SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2`,
            [pollId, userId]
        );
        return (res.rows || []).map(r => r.option_index);
    }

    _mapPoll(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            messageId: row.message_id,
            question: row.question,
            options: row.options_json ? safeParse(row.options_json, []) : [],
            multiChoice: !!row.multi_choice,
            anonymous: !!row.anonymous,
            endsAt: row.ends_at,
            status: row.status,
            createdBy: row.created_by,
            createdAt: row.created_at
        };
    }
}
function safeParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}
module.exports = { PollsRepository };
