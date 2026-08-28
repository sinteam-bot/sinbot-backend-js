const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { initDatabase } = require('../db/index.js');
const { config, getConfig } = require('../config/index.js');
const { AuthAuditService, authAuditService } = require('./auth-audit.service.js');
const logger = require('../utils/logger.js');

/**
 * Service central d'authentification, JWT, OAuth2 Discord et contrôle RBAC
 */
class AuthService {
    constructor(db = null, auditService = null) {
        this._db = db;
        this.audit = auditService || (db ? new AuthAuditService(db) : authAuditService);
        this.jwtSecret = process.env.JWT_SECRET || 'sinbot_dev_jwt_secret_change_in_prod_!9823#';
        this.accessTokenTtl = '15m'; // 15 minutes
        this.refreshTokenTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 jours
        this.maxFailedAttempts = 5;
        this.blockDurationMs = 15 * 60 * 1000; // 15 minutes
        this.recidivismBlockDurationMs = 60 * 60 * 1000; // 1 heure
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

    _mapSession(r) {
        if (!r) return null;
        return {
            id: r.id,
            userId: r.user_id,
            username: r.username,
            avatarUrl: r.avatar_url,
            role: r.role,
            refreshTokenHash: r.refresh_token_hash,
            ipAddress: r.ip_address,
            userAgent: r.user_agent,
            expiresAt: Number(r.expires_at),
            createdAt: Number(r.created_at),
            updatedAt: Number(r.updated_at),
            revokedAt: r.revoked_at ? Number(r.revoked_at) : null
        };
    }

    _mapAttempt(r) {
        if (!r) return null;
        return {
            identifier: r.identifier,
            attemptCount: Number(r.attempt_count),
            firstAttemptAt: Number(r.first_attempt_at),
            lastAttemptAt: Number(r.last_attempt_at),
            blockedUntil: r.blocked_until ? Number(r.blocked_until) : null
        };
    }

    /**
     * Calcule le hash SHA-256 d'un refresh token
     */
    hashToken(token) {
        return crypto.createHash('sha256').update(String(token)).digest('hex');
    }

    /**
     * Génère un identifiant unique aléatoire (UUID v4)
     */
    generateId() {
        return crypto.randomUUID();
    }

    /**
     * Génère un refresh token cryptographiquement sécurisé
     */
    generateRefreshToken() {
        return crypto.randomBytes(48).toString('hex');
    }

    // ============================================
    // 1. GESTION DES TOKENS JWT (ACCESS TOKENS)
    // ============================================

    /**
     * Génère un Access Token JWT signé
     */
    generateAccessToken(payload) {
        const secret = process.env.JWT_SECRET || this.jwtSecret;
        return jwt.sign(
            {
                sub: payload.userId,
                username: payload.username,
                avatar: payload.avatarUrl || null,
                role: payload.role || 'viewer',
                sessionId: payload.sessionId
            },
            secret,
            {
                expiresIn: this.accessTokenTtl,
                issuer: 'chienne-bot-auth'
            }
        );
    }

    /**
     * Vérifie et décode un Access Token JWT
     */
    verifyAccessToken(token) {
        if (!token || typeof token !== 'string') return null;
        const secret = process.env.JWT_SECRET || this.jwtSecret;
        try {
            return jwt.verify(token, secret, { issuer: 'chienne-bot-auth' });
        } catch {
            return null;
        }
    }

    // ============================================
    // 2. GESTION DES SESSIONS POSTGRESQL (RTR)
    // ============================================

    /**
     * Crée une nouvelle session utilisateur en base de données
     */
    async createSession({ userId, username, avatarUrl = null, role = 'viewer', ipAddress = null, userAgent = null }) {
        const sessionId = this.generateId();
        const refreshToken = this.generateRefreshToken();
        const refreshTokenHash = this.hashToken(refreshToken);
        const now = Date.now();
        const expiresAt = now + this.refreshTokenTtlMs;
        const safeUserAgent = userAgent ? userAgent.substring(0, 500) : null;

        await this.query(
            `INSERT INTO auth_sessions (id, user_id, username, avatar_url, role, refresh_token_hash, ip_address, user_agent, expires_at, created_at, updated_at, revoked_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [sessionId, userId, username, avatarUrl, role, refreshTokenHash, ipAddress, safeUserAgent, expiresAt, now, now, null]
        );

        const accessToken = this.generateAccessToken({
            userId,
            username,
            avatarUrl,
            role,
            sessionId
        });

        await this.audit.logEvent({
            eventType: 'LOGIN_SUCCESS',
            userId,
            username,
            ipAddress: ipAddress || 'unknown',
            userAgent,
            metadata: { sessionId, role }
        });

        if (ipAddress) {
            await this.clearFailedAttempts(ipAddress);
        }

        return {
            session: {
                id: sessionId,
                userId,
                username,
                avatarUrl,
                role,
                refreshTokenHash,
                ipAddress,
                userAgent: safeUserAgent,
                expiresAt,
                createdAt: now,
                updatedAt: now,
                revokedAt: null
            },
            accessToken,
            refreshToken,
            expiresAt
        };
    }

    /**
     * Effectue une rotation de Refresh Token (RTR) et délivre un nouveau tuple
     */
    async refreshTokens(providedRefreshToken, ipAddress = null, userAgent = null) {
        if (!providedRefreshToken || typeof providedRefreshToken !== 'string') {
            throw new Error('Refresh token manquant ou invalide.');
        }

        const tokenHash = this.hashToken(providedRefreshToken);
        const res = await this.query(`SELECT * FROM auth_sessions WHERE refresh_token_hash = $1 LIMIT 1`, [tokenHash]);
        const session = this._mapSession(res.rows?.[0]);

        const now = Date.now();

        // 1. Session introuvable ou déjà révoquée
        if (!session || session.revokedAt || session.expiresAt < now) {
            await this.audit.logEvent({
                eventType: 'REFRESH_FAILURE',
                ipAddress: ipAddress || 'unknown',
                userAgent,
                reason: !session ? 'session_not_found' : session.revokedAt ? 'session_revoked' : 'session_expired'
            });
            throw new Error('Session expirée ou invalide. Veuillez vous reconnecter.');
        }

        // 2. Rotation : nouveau refresh token et invalidation de l'ancien
        const newRefreshToken = this.generateRefreshToken();
        const newRefreshTokenHash = this.hashToken(newRefreshToken);
        const newExpiresAt = now + this.refreshTokenTtlMs;
        const safeUserAgent = userAgent ? userAgent.substring(0, 500) : session.userAgent;

        await this.query(
            `UPDATE auth_sessions SET refresh_token_hash = $1, expires_at = $2, updated_at = $3, ip_address = $4, user_agent = $5 WHERE id = $6`,
            [newRefreshTokenHash, newExpiresAt, now, ipAddress || session.ipAddress, safeUserAgent, session.id]
        );

        const newAccessToken = this.generateAccessToken({
            userId: session.userId,
            username: session.username,
            avatarUrl: session.avatarUrl,
            role: session.role,
            sessionId: session.id
        });

        await this.audit.logEvent({
            eventType: 'REFRESH_SUCCESS',
            userId: session.userId,
            username: session.username,
            ipAddress: ipAddress || 'unknown',
            userAgent,
            metadata: { sessionId: session.id }
        });

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user: {
                userId: session.userId,
                username: session.username,
                avatarUrl: session.avatarUrl,
                role: session.role
            }
        };
    }

    /**
     * Révoque une session (Logout)
     */
    async revokeSession(sessionId, ipAddress = null) {
        if (!sessionId) return;
        const now = Date.now();

        await this.query(`UPDATE auth_sessions SET revoked_at = $1, updated_at = $2 WHERE id = $3`, [now, now, sessionId]);

        await this.audit.logEvent({
            eventType: 'LOGOUT',
            ipAddress: ipAddress || 'unknown',
            metadata: { sessionId }
        });
    }

    /**
     * Nettoie les sessions expirées depuis plus de 7 jours
     */
    async cleanupExpiredSessions() {
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
        try {
            await this.query(`DELETE FROM auth_sessions WHERE expires_at < $1`, [cutoff]);
        } catch (err) {
            logger.warn(`Erreur nettoyage sessions expirées: ${err.message}`, 'AUTH');
        }
    }

    // ============================================
    // 3. PROTECTION ANTI BRUTE-FORCE PROGRESSIVE
    // ============================================

    /**
     * Vérifie si une IP ou un identifiant est actuellement bloqué
     */
    async isBlocked(identifier) {
        if (!identifier) return { isBlocked: false, remainingMs: 0 };
        const now = Date.now();

        const res = await this.query(`SELECT * FROM auth_failed_attempts WHERE identifier = $1 LIMIT 1`, [identifier]);
        const record = this._mapAttempt(res.rows?.[0]);

        if (!record || !record.blockedUntil) {
            return { isBlocked: false, remainingMs: 0 };
        }

        if (record.blockedUntil > now) {
            return { isBlocked: true, remainingMs: record.blockedUntil - now };
        }

        return { isBlocked: false, remainingMs: 0 };
    }

    /**
     * Enregistre une tentative d'authentification échouée et applique le blocage si seuil atteint
     */
    async recordFailedAttempt(identifier, reason = 'invalid_credentials', metadata = null) {
        if (!identifier) return { blocked: false, attemptCount: 1, blockedUntil: null };
        const now = Date.now();

        const res = await this.query(`SELECT * FROM auth_failed_attempts WHERE identifier = $1 LIMIT 1`, [identifier]);
        const record = this._mapAttempt(res.rows?.[0]);

        const attemptCount = (record ? record.attemptCount : 0) + 1;
        let blockedUntil = null;

        if (attemptCount >= this.maxFailedAttempts) {
            const isRecidivist = attemptCount >= this.maxFailedAttempts * 2;
            const duration = isRecidivist ? this.recidivismBlockDurationMs : this.blockDurationMs;
            blockedUntil = now + duration;

            await this.audit.logEvent({
                eventType: 'IP_BLOCKED',
                ipAddress: identifier,
                reason: `Tentatives excessives (${attemptCount} échecs)`,
                metadata: { blockedUntil, durationMs: duration, ...metadata }
            });
        }

        if (record) {
            await this.query(
                `UPDATE auth_failed_attempts SET attempt_count = $1, last_attempt_at = $2, blocked_until = $3 WHERE identifier = $4`,
                [attemptCount, now, blockedUntil, identifier]
            );
        } else {
            await this.query(
                `INSERT INTO auth_failed_attempts (identifier, attempt_count, first_attempt_at, last_attempt_at, blocked_until) VALUES ($1, $2, $3, $4, $5)`,
                [identifier, attemptCount, now, now, blockedUntil]
            );
        }

        await this.audit.logEvent({
            eventType: 'LOGIN_FAILURE',
            ipAddress: identifier,
            reason,
            metadata: { attemptCount, ...metadata }
        });

        return {
            blocked: !!blockedUntil,
            attemptCount,
            blockedUntil
        };
    }

    /**
     * Efface les tentatives échouées après un succès ou déblocage admin
     */
    async clearFailedAttempts(identifier) {
        if (!identifier) return;
        try {
            await this.query(`DELETE FROM auth_failed_attempts WHERE identifier = $1`, [identifier]);
        } catch (err) {
            logger.warn(`Erreur reset failed attempts (${identifier}): ${err.message}`, 'AUTH');
        }
    }

    // ============================================
    // 4. CALCUL DU RÔLE RBAC DISCORD
    // ============================================

    /**
     * Détermine le rôle RBAC ('admin' | 'mod' | 'viewer') à partir des rôles et permissions Discord
     */
    determineRbacRole(member, guild = null) {
        if (!member) return 'viewer';

        const curConfig = getConfig ? getConfig() : config;
        const rolesMapping = curConfig.web?.auth?.roles_mapping || {};
        const adminRoleIds = rolesMapping.admin_roles || [];
        const modRoleIds = rolesMapping.mod_roles || [];

        const memberId = member.id || member.user?.id;
        const memberRoleIds = member._roles || member.roles?.cache ? Array.from(member.roles.cache.keys()) : (Array.isArray(member.roles) ? member.roles : []);

        // 1. Propriétaire du serveur Discord ➔ Toujours Admin
        if (guild && (guild.ownerId === memberId || guild.owner_id === memberId)) {
            return 'admin';
        }

        // 2. Permission Administrator Discord ➔ Admin
        if (member.permissions?.has && member.permissions.has('Administrator')) {
            return 'admin';
        }

        // 3. Rôles explicitement déclarés comme Admin dans config.yml
        if (adminRoleIds.some(adminId => memberRoleIds.includes(String(adminId)))) {
            return 'admin';
        }

        // 4. Permissions Modération Discord ➔ Mod
        if (member.permissions?.has && (
            member.permissions.has('ManageGuild') ||
            member.permissions.has('ModerateMembers') ||
            member.permissions.has('ManageMessages') ||
            member.permissions.has('KickMembers') ||
            member.permissions.has('BanMembers')
        )) {
            return 'mod';
        }

        // 5. Rôles explicitement déclarés comme Mod dans config.yml
        if (modRoleIds.some(modId => memberRoleIds.includes(String(modId)))) {
            return 'mod';
        }

        // 6. Membre standard ➔ Viewer
        return 'viewer';
    }

    // ============================================
    // 5. OAUTH2 DISCORD HELPERS
    // ============================================

    getDiscordOAuthUrl(state) {
        const curConfig = getConfig ? getConfig() : config;
        const oauthConf = curConfig.web?.auth?.discord_oauth || {};
        const clientId = oauthConf.client_id || curConfig.discord?.client_id || process.env.CLIENT_ID;
        const redirectUri = oauthConf.redirect_uri || process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback';
        const scopes = (oauthConf.scopes || ['identify', 'guilds.members.read']).join('%20');

        return `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}&state=${encodeURIComponent(state)}`;
    }

    async exchangeDiscordCode(code) {
        const curConfig = getConfig ? getConfig() : config;
        const oauthConf = curConfig.web?.auth?.discord_oauth || {};
        const clientId = oauthConf.client_id || curConfig.discord?.client_id || process.env.CLIENT_ID;
        const clientSecret = oauthConf.client_secret || process.env.DISCORD_CLIENT_SECRET;
        const redirectUri = oauthConf.redirect_uri || process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback';

        if (!clientSecret) {
            throw new Error('DISCORD_CLIENT_SECRET non configuré sur le serveur.');
        }

        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri
        });

        const res = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Échec échange code Discord OAuth2 (${res.status}): ${err}`);
        }

        return await res.json();
    }

    async fetchDiscordUserProfile(discordAccessToken) {
        const res = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${discordAccessToken}` }
        });

        if (!res.ok) {
            throw new Error(`Échec récupération profil Discord (${res.status})`);
        }

        return await res.json();
    }
}

const authService = new AuthService();

module.exports = {
    AuthService,
    authService
};
