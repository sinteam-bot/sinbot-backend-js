/**
 * StatsService — agrégations pour le dashboard
 *
 * Calcule les KPIs globaux du serveur à partir des tables existantes.
 */

const { db } = require('../../../db/index.js');

class StatsService {
    static inject = [];

    /**
     * Vue d'ensemble : membres, messages 24h, warns 24h, boosts
     */
    async overview(guildId) {
        if (!guildId) return null;
        const last24h = Date.now() - 24 * 3600 * 1000;
        const last7d = Date.now() - 7 * 24 * 3600 * 1000;

        const members = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM server_members WHERE deleted_at IS NULL AND left_at IS NULL`,
            []
        );
        const msgs24h = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM event_log WHERE guild_id = $1 AND event_type LIKE 'message_%' AND created_at > $2`,
            [guildId, last24h]
        );
        const warns24h = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM mod_logs WHERE guild_id = $1 AND action = 'warn' AND created_at > $2`,
            [guildId, last24h]
        );
        const activeUsers7d = await db.pool.query(
            `SELECT COUNT(DISTINCT actor_id)::int AS count FROM event_log WHERE guild_id = $1 AND actor_id IS NOT NULL AND created_at > $2`,
            [guildId, last7d]
        );
        const ticketsOpen = await db.pool.query(
            `SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 AND status IN ('open', 'claimed')`,
            [guildId]
        );

        return {
            members: members?.rows?.[0]?.count || 0,
            messages_24h: msgs24h?.rows?.[0]?.count || 0,
            warnings_24h: warns24h?.rows?.[0]?.count || 0,
            active_users_7d: activeUsers7d?.rows?.[0]?.count || 0,
            tickets_open: ticketsOpen?.rows?.[0]?.count || 0
        };
    }

    /**
     * Messages par jour sur les N derniers jours
     */
    async messagesByDay(guildId, days = 7) {
        if (!guildId) return [];
        const since = Date.now() - days * 24 * 3600 * 1000;
        const result = await db.pool.query(
            `SELECT
                to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS count
             FROM event_log
             WHERE guild_id = $1 AND event_type LIKE 'message_%' AND created_at > $2
             GROUP BY day
             ORDER BY day ASC`,
            [guildId, since]
        );
        return result.rows || [];
    }

    /**
     * Évolution du nombre de membres sur N jours
     */
    async memberGrowth(guildId, days = 30) {
        if (!guildId) return [];
        const since = Date.now() - days * 24 * 3600 * 1000;
        const result = await db.pool.query(
            `SELECT
                to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS count
             FROM event_log
             WHERE guild_id = $1 AND event_type = 'member_join' AND created_at > $2
             GROUP BY day
             ORDER BY day ASC`,
            [guildId, since]
        );
        return result.rows || [];
    }

    /**
     * Activité de modération par semaine
     */
    async moderationByWeek(guildId, weeks = 4) {
        if (!guildId) return [];
        const since = Date.now() - weeks * 7 * 24 * 3600 * 1000;
        const result = await db.pool.query(
            `SELECT
                action,
                COUNT(*)::int AS count
             FROM mod_logs
             WHERE guild_id = $1 AND created_at > $2
             GROUP BY action
             ORDER BY count DESC`,
            [guildId, since]
        );
        return result.rows || [];
    }
}

module.exports = { StatsService };
