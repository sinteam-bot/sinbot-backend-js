/**
 * src/modules/security_autoban/services/autoban.repository.js
 *
 * Couche BDD pour la persistance des logs autoban.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class AutobanRepository {
    async logAction({ guildId, userId, userTag, reason, action }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO autoban_logs (id, guild_id, user_id, user_tag, reason, action, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, guildId, userId, userTag || null, reason, action, now]
        );

        return { id, guildId, userId, userTag, reason, action, createdAt: now };
    }

    async listLogs(guildId, limit = 50) {
        const res = await db.pool.query(
            `SELECT * FROM autoban_logs WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [guildId, limit]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            guildId: r.guild_id,
            userId: r.user_id,
            userTag: r.user_tag,
            reason: r.reason,
            action: r.action,
            createdAt: Number(r.created_at || 0)
        }));
    }
}

module.exports = { AutobanRepository };
