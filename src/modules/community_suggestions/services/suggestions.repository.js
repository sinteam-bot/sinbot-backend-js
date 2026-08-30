/**
 * src/modules/community_suggestions/services/suggestions.repository.js
 *
 * Couche d'accès aux données pour le module Suggestions.
 */

const { db } = require('../../../db/index.js');
const { Injectable } = require('../../../core/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class SuggestionsRepository {
    async getNextSuggestionNumber(guildId) {
        const res = await db.pool.query(
            `SELECT COALESCE(MAX(suggestion_number), 0) + 1 AS next_num FROM suggestions WHERE guild_id = $1`,
            [guildId]
        );
        return Number(res.rows?.[0]?.next_num || 1);
    }

    async createSuggestion(data) {
        const id = data.id || newId();
        const now = Date.now();
        const number = data.suggestionNumber || await this.getNextSuggestionNumber(data.guildId);

        await db.pool.query(
            `INSERT INTO suggestions 
             (id, guild_id, user_id, suggestion_number, content, status, channel_id, message_id, staff_id, staff_reason, upvotes, downvotes, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
            [
                id,
                data.guildId,
                data.userId,
                number,
                data.content,
                data.status || 'pending',
                data.channelId || null,
                data.messageId || null,
                data.staffId || null,
                data.staffReason || null,
                data.upvotes || 0,
                data.downvotes || 0,
                now
            ]
        );

        return this.getSuggestion(id);
    }

    async getSuggestion(id) {
        const res = await db.pool.query(`SELECT * FROM suggestions WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapSuggestion(res.rows[0]) : null;
    }

    async getSuggestionByNumber(guildId, number) {
        const res = await db.pool.query(
            `SELECT * FROM suggestions WHERE guild_id = $1 AND suggestion_number = $2 LIMIT 1`,
            [guildId, number]
        );
        return res.rows?.[0] ? this._mapSuggestion(res.rows[0]) : null;
    }

    async getSuggestionByMessageId(guildId, messageId) {
        const res = await db.pool.query(
            `SELECT * FROM suggestions WHERE guild_id = $1 AND message_id = $2 LIMIT 1`,
            [guildId, messageId]
        );
        return res.rows?.[0] ? this._mapSuggestion(res.rows[0]) : null;
    }

    async updateSuggestion(id, fields) {
        const allowed = ['status', 'staff_id', 'staff_reason', 'channel_id', 'message_id', 'upvotes', 'downvotes', 'content'];
        const setSql = [];
        const params = [];
        for (const [k, v] of Object.entries(fields)) {
            const col = k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            if (allowed.includes(col)) {
                params.push(v);
                setSql.push(`${col} = $${params.length}`);
            }
        }
        if (setSql.length === 0) return this.getSuggestion(id);
        params.push(Date.now(), id);
        setSql.push(`updated_at = $${params.length - 1}`);

        await db.pool.query(
            `UPDATE suggestions SET ${setSql.join(', ')} WHERE id = $${params.length}`,
            params
        );
        return this.getSuggestion(id);
    }

    async deleteSuggestion(id) {
        await db.pool.query(`DELETE FROM suggestions WHERE id = $1`, [id]);
    }

    async listSuggestions(guildId, { status, userId, limit = 50, offset = 0 } = {}) {
        const where = ['guild_id = $1'];
        const args = [guildId];

        if (status && status !== 'all') {
            args.push(status);
            where.push(`status = $${args.length}`);
        }
        if (userId) {
            args.push(userId);
            where.push(`user_id = $${args.length}`);
        }

        args.push(limit, offset);
        const sql = `SELECT * FROM suggestions WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`;
        const res = await db.pool.query({ text: sql, values: args });
        return (res.rows || []).map(r => this._mapSuggestion(r));
    }

    async countSuggestions(guildId, status) {
        const where = ['guild_id = $1'];
        const args = [guildId];

        if (status && status !== 'all') {
            args.push(status);
            where.push(`status = $${args.length}`);
        }

        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM suggestions WHERE ${where.join(' AND ')}`,
            args
        );
        return res.rows?.[0]?.count || 0;
    }

    _mapSuggestion(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            userId: row.user_id,
            suggestionNumber: Number(row.suggestion_number),
            content: row.content,
            status: row.status,
            channelId: row.channel_id,
            messageId: row.message_id,
            staffId: row.staff_id,
            staffReason: row.staff_reason,
            upvotes: Number(row.upvotes || 0),
            downvotes: Number(row.downvotes || 0),
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

Injectable()(SuggestionsRepository);

module.exports = { SuggestionsRepository };
