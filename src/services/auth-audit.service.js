const { initDatabase } = require('../db/index.js');
const logger = require('../utils/logger.js');

/**
 * Service de journalisation d'audit de sécurité et d'authentification
 */
class AuthAuditService {
    constructor(db = null) {
        this._db = db;
    }

    get pool() {
        if (this._db?.pool) return this._db.pool;
        if (this._db?.query) return this._db;
        const ctx = initDatabase();
        return ctx.pool || ctx.db?.pool || ctx.db;
    }

    async query(sqlText, params = []) {
        const p = this.pool;
        if (!p) return { rows: [] };
        return p.query(sqlText, params);
    }

    _map(r) {
        if (!r) return null;
        return {
            id: r.id,
            eventType: r.event_type,
            userId: r.user_id,
            username: r.username,
            ipAddress: r.ip_address,
            userAgent: r.user_agent,
            reason: r.reason,
            metadata: r.metadata,
            createdAt: Number(r.created_at)
        };
    }

    /**
     * Enregistre un événement de sécurité dans les logs d'audit
     */
    async logEvent({ eventType, userId = null, username = null, ipAddress, userAgent = null, reason = null, metadata = null }) {
        if (!eventType || !ipAddress) {
            return null;
        }

        const now = Date.now();
        const metaStr = typeof metadata === 'object' && metadata !== null ? JSON.stringify(metadata) : metadata;

        try {
            const res = await this.query(
                `INSERT INTO auth_audit_logs (event_type, user_id, username, ip_address, user_agent, reason, metadata, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [eventType, userId, username, ipAddress, userAgent ? userAgent.substring(0, 500) : null, reason, metaStr, now]
            );
            return res.rows?.[0] ? this._map(res.rows[0]) : { eventType, userId, username, ipAddress, reason, createdAt: now };
        } catch (error) {
            logger.error(`Erreur enregistrement audit log (${eventType}): ${error.message}`, 'AUTH_AUDIT');
        }
        return null;
    }

    /**
     * Récupère la liste paginée des logs d'audit avec filtres optionnels
     */
    async getLogs({ limit = 50, offset = 0, eventType = null, userId = null, ipAddress = null } = {}) {
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

        try {
            const conditions = [];
            const params = [];

            if (eventType) {
                params.push(eventType);
                conditions.push(`event_type = $${params.length}`);
            }
            if (userId) {
                params.push(userId);
                conditions.push(`user_id = $${params.length}`);
            }
            if (ipAddress) {
                params.push(ipAddress);
                conditions.push(`ip_address = $${params.length}`);
            }

            const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            params.push(safeLimit, safeOffset);
            const querySql = `SELECT * FROM auth_audit_logs ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
            const countSql = `SELECT count(*)::int as total FROM auth_audit_logs ${whereSql}`;

            const [dataRes, countRes] = await Promise.all([
                this.query(querySql, params),
                this.query(countSql, params.slice(0, conditions.length))
            ]);

            return {
                logs: (dataRes.rows || []).map(r => this._map(r)),
                total: countRes.rows?.[0]?.total || 0,
                limit: safeLimit,
                offset: safeOffset
            };
        } catch (error) {
            logger.error(`Erreur récupération audit logs: ${error.message}`, 'AUTH_AUDIT');
        }

        return { logs: [], total: 0, limit: safeLimit, offset: safeOffset };
    }
}

const authAuditService = new AuthAuditService();

module.exports = {
    AuthAuditService,
    authAuditService
};
