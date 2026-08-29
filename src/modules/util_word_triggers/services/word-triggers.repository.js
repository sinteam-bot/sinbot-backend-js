/**
 * wordTriggers.repository.js — couche d'accès BDD
 *
 * Dupliqué depuis l'ancien engagement.repository.js (split Phase 9.2 du
 * plan migrate-to-c12).
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

function safeParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

class WordTriggersRepository {
    // =================== WORD TRIGGERS ===================

    async insertTrigger(t) {
        const id = t.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO word_triggers
             (id, guild_id, trigger_text, match_type, response_text, response_embed_json, exclude_channel_ids_json, exclude_role_ids_json, cooldown_seconds, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
            [id, t.guildId, t.triggerText, t.matchType || 'exact',
             t.responseText || null, t.responseEmbedJson || null,
             t.excludeChannelIdsJson || null, t.excludeRoleIdsJson || null,
             t.cooldownSeconds ?? 10, t.createdBy || null, now]
        );
        return this.getTrigger(id);
    }

    async getTrigger(id) {
        const res = await db.pool.query(`SELECT * FROM word_triggers WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapTrigger(res.rows[0]) : null;
    }

    async listTriggers(guildId, limit = 100) {
        const res = await db.pool.query(
            `SELECT * FROM word_triggers WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [guildId, limit]
        );
        return (res.rows || []).map(r => this._mapTrigger(r));
    }

    async deleteTrigger(id) {
        await db.pool.query(`DELETE FROM word_triggers WHERE id = $1`, [id]);
    }

}

module.exports = { WordTriggersRepository };
