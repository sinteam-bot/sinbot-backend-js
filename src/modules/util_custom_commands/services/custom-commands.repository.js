/**
 * customCommands.repository.js — couche d'accès BDD
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

class CustomCommandsRepository {
    // =================== CUSTOM COMMANDS ===================

    async insertCustomCommand(c) {
        const id = c.id || newId();
        const now = Date.now();
        await db.pool.query(
            `INSERT INTO custom_commands
             (id, guild_id, name, response_text, response_embed_json, restrict_channel_ids_json, restrict_role_ids_json, cooldown_seconds, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, c.guildId, c.name, c.responseText || null, c.responseEmbedJson || null,
             c.restrictChannelIdsJson || null, c.restrictRoleIdsJson || null,
             c.cooldownSeconds ?? 5, c.createdBy || null, now]
        );
        return this.getCustomCommand(id);
    }

    async getCustomCommand(id) {
        const res = await db.pool.query(`SELECT * FROM custom_commands WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapCustomCommand(res.rows[0]) : null;
    }

    async getCustomCommandByName(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM custom_commands WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
            [guildId, name]
        );
        return res.rows?.[0] ? this._mapCustomCommand(res.rows[0]) : null;
    }

    async listCustomCommands(guildId, limit = 100) {
        const res = await db.pool.query(
            `SELECT * FROM custom_commands WHERE guild_id = $1 ORDER BY name ASC LIMIT $2`,
            [guildId, limit]
        );
        return (res.rows || []).map(r => this._mapCustomCommand(r));
    }

    async deleteCustomCommand(id) {
        await db.pool.query(`DELETE FROM custom_commands WHERE id = $1`, [id]);
    }

}

module.exports = { CustomCommandsRepository };
