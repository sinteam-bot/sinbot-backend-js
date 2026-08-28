/**
 * sticky-roles.repository.js — couche d'accès BDD
 */

const { db } = require('../../../db/index.js');

class StickyRolesRepository {
    async saveRoles(guildId, userId, roleIds) {
        if (!roleIds || roleIds.length === 0) return;
        const now = Date.now();
        for (const roleId of roleIds) {
            try {
                await db.pool.query(
                    `INSERT INTO sticky_roles (user_id, guild_id, role_id, saved_at) VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, guild_id, role_id) DO UPDATE SET saved_at = $4`,
                    [userId, guildId, roleId, now]
                );
            } catch (err) {
                // Continue on single role failure
            }
        }
    }

    async listForUser(guildId, userId) {
        const res = await db.pool.query(
            `SELECT role_id, saved_at FROM sticky_roles WHERE guild_id = $1 AND user_id = $2 ORDER BY saved_at DESC`,
            [guildId, userId]
        );
        return (res.rows || []).map(r => ({ roleId: r.role_id, savedAt: typeof r.saved_at === 'string' ? parseInt(r.saved_at) : Number(r.saved_at) }));
    }

    async clear(guildId, userId) {
        await db.pool.query(
            `DELETE FROM sticky_roles WHERE guild_id = $1 AND user_id = $2`,
            [guildId, userId]
        );
    }

    async removeRole(guildId, userId, roleId) {
        await db.pool.query(
            `DELETE FROM sticky_roles WHERE guild_id = $1 AND user_id = $2 AND role_id = $3`,
            [guildId, userId, roleId]
        );
    }

    async countForUser(guildId, userId) {
        const res = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM sticky_roles WHERE guild_id = $1 AND user_id = $2`,
            [guildId, userId]
        );
        return res.rows?.[0]?.count || 0;
    }
}

module.exports = { StickyRolesRepository };
