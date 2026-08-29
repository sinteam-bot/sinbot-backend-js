/**
 * Sanctions — gestion des sanctions (warn, mute, kick, ban)
 *
 * Applique la progression automatique en fonction du nombre de warns actifs.
 * Délègue l'exécution à discord.js via le client fourni.
 */

const crypto = require('crypto');

function newId() {
    return crypto.randomUUID();
}

/**
 * Parse une durée "1h", "30m", "1d" en millisecondes
 * Supporte: s, m, h, d
 */
function parseDuration(str) {
    if (!str || typeof str !== 'string') return null;
    const m = String(str).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
    return n * mult;
}

class Sanctions {
    constructor() {
        this.modLog = null;
    }

    setModLog(modLog) {
        this.modLog = modLog;
    }

    /**
     * Crée un warn en base
     * @returns {Promise<{id: string}>}
     */
    async warn(guild, targetUser, modUser, reason, source = 'manual', rule = null) {
        const { db, schema } = require('../../../db/index.js');
        const now = Date.now();
        const id = newId();
        await db.pool.query(
            `INSERT INTO user_warnings (id, guild_id, user_id, mod_id, reason, source, rule, created_at, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, guild.id, targetUser.id, modUser.id, reason, source, rule, now, 1]
        );
        if (this.modLog) {
            await this.modLog.publish(guild, targetUser, modUser, 'warn', { reason, source, rule });
        }
        return { id };
    }

    /**
     * Applique un timeout Discord (mute)
     */
    async mute(guild, targetMember, modUser, durationMs, reason) {
        const { db, schema } = require('../../../db/index.js');
        const now = Date.now();
        const id = newId();
        await db.pool.query(
            `INSERT INTO user_sanctions (id, guild_id, user_id, type, reason, mod_id, duration_ms, starts_at, expires_at, active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, guild.id, targetMember.id, 'timeout', reason, modUser.id, durationMs, now, now + durationMs, 1, now]
        );
        try {
            await targetMember.timeout(durationMs, reason);
        } catch (err) {
            console.error(`[Sanctions] timeout failed: ${err.message}`);
        }
        if (this.modLog) {
            await this.modLog.publish(guild, targetMember, modUser, 'mute', { reason, duration_ms: durationMs });
        }
        return { id };
    }

    /**
     * Kick un membre
     */
    async kick(guild, targetMember, modUser, reason) {
        const { db, schema } = require('../../../db/index.js');
        const now = Date.now();
        const id = newId();
        await db.pool.query(
            `INSERT INTO user_sanctions (id, guild_id, user_id, type, reason, mod_id, starts_at, active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, guild.id, targetMember.id, 'kick', reason, modUser.id, now, 1, now]
        );
        try {
            await targetMember.kick(reason);
        } catch (err) {
            console.error(`[Sanctions] kick failed: ${err.message}`);
        }
        if (this.modLog) {
            await this.modLog.publish(guild, targetMember, modUser, 'kick', { reason });
        }
        return { id };
    }

    /**
     * Bannit un membre
     */
    async ban(guild, targetUser, modUser, reason, durationMs = null) {
        const { db, schema } = require('../../../db/index.js');
        const now = Date.now();
        const id = newId();
        await db.pool.query(
            `INSERT INTO user_sanctions (id, guild_id, user_id, type, reason, mod_id, duration_ms, starts_at, expires_at, active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, guild.id, targetUser.id, 'ban', reason, modUser.id, durationMs, now, durationMs ? now + durationMs : null, 1, now]
        );
        try {
            await guild.members.ban(targetUser.id, { reason });
        } catch (err) {
            console.error(`[Sanctions] ban failed: ${err.message}`);
        }
        if (this.modLog) {
            await this.modLog.publish(guild, targetUser, modUser, 'ban', { reason, duration_ms: durationMs });
        }
        return { id };
    }

    /**
     * Débannit un utilisateur
     */
    async unban(guild, userId, modUser, reason) {
        const { db } = require('../../../db/index.js');
        const now = Date.now();
        try {
            await guild.members.unban(userId, reason);
        } catch (err) {
            console.error(`[Sanctions] unban failed: ${err.message}`);
        }
        await db.pool.query(
            `UPDATE user_sanctions SET active = 0, revoked_by = $1, revoked_at = $2, revoked_reason = $3 WHERE guild_id = $4 AND user_id = $5 AND type = 'ban' AND active = 1`,
            [modUser.id, now, reason, guild.id, userId]
        );
        if (this.modLog) {
            await this.modLog.publish(guild, { id: userId }, modUser, 'unban', { reason });
        }
        return { ok: true };
    }

    /**
     * Compte les warns actifs (non expirés) pour un utilisateur
     */
    async countActiveWarnings(guildId, userId) {
        const { db } = require('../../../db/index.js');
        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM user_warnings WHERE guild_id = $1 AND user_id = $2 AND active = 1 AND (expires_at IS NULL OR expires_at > $3)`,
            [guildId, userId, Date.now()]
        );
        return res.rows?.[0]?.count || 0;
    }

    /**
     * Détermine la prochaine sanction à appliquer selon la progression
     * @returns {{ action: string, duration?: string } | null}
     */
    pickProgression(activeWarnCount, progression) {
        if (!Array.isArray(progression)) return null;
        const sorted = [...progression].sort((a, b) => a.warnings - b.warnings);
        let chosen = null;
        for (const step of sorted) {
            if (activeWarnCount >= step.warnings) {
                chosen = step;
            }
        }
        return chosen ? { action: chosen.action, duration: chosen.duration } : null;
    }
}

module.exports = { Sanctions, parseDuration };
