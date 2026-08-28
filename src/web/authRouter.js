const express = require('express');
const crypto = require('crypto');
const { authService } = require('../services/auth.service.js');
const { authAuditService } = require('../services/auth-audit.service.js');
const { requireRole, getClientIp, checkBruteForceBlocked, timingSafeEqual } = require('../utils/security.js');
const { getConfig, config } = require('../config/index.js');
const logger = require('../utils/logger.js');

function createAuthRouter(client) {
    const router = express.Router();

    // ============================================
    // 1. STATUT DE L'AUTHENTIFICATION (PUBLIC)
    // ============================================
    router.get('/status', (req, res) => {
        const curConfig = getConfig ? getConfig() : config;
        const authConfig = curConfig.web?.auth || {};
        res.json({
            success: true,
            authRequired: !!authConfig.enabled,
            protectStatic: !!authConfig.protect_static,
            mode: authConfig.mode || 'discord_oauth'
        });
    });

    // ============================================
    // 2. VÉRIFICATION CLÉ API (AVEC BRUTE-FORCE PROTECTION)
    // ============================================
    router.post('/verify', checkBruteForceBlocked, async (req, res) => {
        const curConfig = getConfig ? getConfig() : config;
        const authConfig = curConfig.web?.auth || {};
        const { apiKey } = req.body || {};
        const ip = getClientIp(req);

        if (!authConfig.enabled) {
            return res.json({ success: true, valid: true });
        }

        const isValid = !!(apiKey && authConfig.api_key && timingSafeEqual(apiKey, authConfig.api_key));

        if (!isValid) {
            const attempt = await authService.recordFailedAttempt(ip, 'invalid_api_key');
            if (attempt.blocked) {
                return res.status(429).json({
                    success: false,
                    valid: false,
                    error: 'Trop de tentatives échouées. Votre adresse IP a été temporairement bloquée.'
                });
            }
            return res.status(401).json({
                success: false,
                valid: false,
                error: 'Clé API invalide.'
            });
        }

        // Succès
        await authService.clearFailedAttempts(ip);
        await authAuditService.logEvent({
            eventType: 'LOGIN_SUCCESS',
            ipAddress: ip,
            reason: 'api_key_valid'
        });

        res.json({
            success: true,
            valid: true
        });
    });

    // ============================================
    // 3. OAUTH2 DISCORD : INITIALISATION DU LOGIN
    // ============================================
    router.get('/discord/login', checkBruteForceBlocked, (req, res) => {
        const state = crypto.randomBytes(24).toString('hex');

        // Stocker le state dans un cookie HttpOnly sécurisé pour validation CSRF
        res.cookie('oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 10 * 60 * 1000 // 10 minutes
        });

        const url = authService.getDiscordOAuthUrl(state);
        res.redirect(url);
    });

    // ============================================
    // 4. OAUTH2 DISCORD : CALLBACK
    // ============================================
    router.get('/discord/callback', checkBruteForceBlocked, async (req, res) => {
        const { code, state, error, error_description } = req.query;
        const storedState = req.cookies?.oauth_state;
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'];

        // Supprimer le cookie de state immédiatement
        res.clearCookie('oauth_state');

        if (error) {
            await authAuditService.logEvent({
                eventType: 'LOGIN_FAILURE',
                ipAddress: ip,
                userAgent,
                reason: `discord_oauth_denied: ${error_description || error}`
            });
            return res.redirect(`/?auth_error=${encodeURIComponent('Connexion Discord refusée par l\'utilisateur.')}`);
        }

        // Vérification anti-CSRF du state
        if (!state || !storedState || state !== storedState) {
            await authAuditService.logEvent({
                eventType: 'LOGIN_FAILURE',
                ipAddress: ip,
                userAgent,
                reason: 'csrf_state_mismatch'
            });
            return res.redirect(`/?auth_error=${encodeURIComponent('Erreur de sécurité CSRF. Veuillez réessayer.')}`);
        }

        try {
            // 1. Échanger le code contre un token Discord
            const tokenData = await authService.exchangeDiscordCode(code);

            // 2. Récupérer le profil utilisateur Discord
            const userProfile = await authService.fetchDiscordUserProfile(tokenData.access_token);

            // 3. Récupérer le guild configuré et le membre dans ce serveur
            const curConfig = getConfig ? getConfig() : config;
            const guildId = curConfig.discord?.guild_id || process.env.GUILD_ID || '702103057898668072';

            let guild = null;
            let member = null;

            if (client && client.isReady()) {
                guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
                if (guild) {
                    member = await guild.members.fetch(userProfile.id).catch(() => null);
                }
            }

            // 4. Vérifier si l'utilisateur appartient au serveur Discord configuré
            if (!member && !process.env.ALLOW_EXTERNAL_USERS) {
                await authService.recordFailedAttempt(ip, 'user_not_in_guild', { userId: userProfile.id });
                return res.redirect(`/?auth_error=${encodeURIComponent('Accès refusé : Vous devez être membre du serveur Discord pour vous connecter.')}`);
            }

            // 5. Calculer le rôle RBAC (admin, mod, viewer)
            const role = authService.determineRbacRole(member || { id: userProfile.id, roles: [] }, guild);

            // 6. Créer la session utilisateur en BDD PostgreSQL
            const avatarUrl = userProfile.avatar
                ? `https://cdn.discordapp.com/avatars/${userProfile.id}/${userProfile.avatar}.${userProfile.avatar.startsWith('a_') ? 'gif' : 'png'}`
                : `https://cdn.discordapp.com/embed/avatars/${(BigInt(userProfile.id) >> 22n) % 6n}.png`;

            const username = userProfile.global_name || userProfile.username;

            const sessionResult = await authService.createSession({
                userId: userProfile.id,
                username,
                avatarUrl,
                role,
                ipAddress: ip,
                userAgent
            });

            // 7. Placer le refresh token dans un cookie HttpOnly sécurisé
            res.cookie('refreshToken', sessionResult.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/api/auth',
                maxAge: authService.refreshTokenTtlMs
            });

            // 8. Rediriger vers le dashboard avec l'access token initial
            res.redirect(`/?token=${encodeURIComponent(sessionResult.accessToken)}&role=${encodeURIComponent(role)}&username=${encodeURIComponent(username)}`);

        } catch (err) {
            logger.error(`Erreur OAuth2 Discord callback: ${err.message}`, 'AUTH');
            await authService.recordFailedAttempt(ip, 'oauth2_callback_exception', { error: err.message });
            res.redirect(`/?auth_error=${encodeURIComponent('Erreur lors de la connexion Discord: ' + err.message)}`);
        }
    });

    // ============================================
    // 5. ROTATION REFRESH TOKEN (RTR)
    // ============================================
    router.post('/refresh', async (req, res) => {
        const token = req.cookies?.refreshToken || req.body?.refreshToken;
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'];

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token manquant.'
            });
        }

        try {
            const result = await authService.refreshTokens(token, ip, userAgent);

            // Mettre à jour le cookie avec le nouveau refresh token
            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/api/auth',
                maxAge: authService.refreshTokenTtlMs
            });

            res.json({
                success: true,
                accessToken: result.accessToken,
                user: result.user
            });
        } catch (error) {
            res.clearCookie('refreshToken', { path: '/api/auth' });
            res.status(401).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============================================
    // 6. DÉCONNEXION (LOGOUT)
    // ============================================
    router.post('/logout', async (req, res) => {
        const ip = getClientIp(req);
        const sessionId = req.user?.sessionId;

        if (sessionId) {
            await authService.revokeSession(sessionId, ip);
        }

        res.clearCookie('refreshToken', { path: '/api/auth' });
        res.json({
            success: true,
            message: 'Déconnexion réussie.'
        });
    });

    // ============================================
    // 7. PROFIL UTILISATEUR COURANT (/ME)
    // ============================================
    router.get('/me', (req, res) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Non authentifié.' });
        }

        res.json({
            success: true,
            user: {
                userId: req.user.userId,
                username: req.user.username,
                avatarUrl: req.user.avatarUrl,
                role: req.user.role,
                isApiKey: !!req.user.isApiKey
            }
        });
    });

    // ============================================
    // 8. AUDIT LOGS (ADMIN ONLY)
    // ============================================
    router.get('/audit-logs', requireRole('admin'), async (req, res) => {
        const { limit, offset, eventType, userId, ipAddress } = req.query;
        const result = await authAuditService.getLogs({ limit, offset, eventType, userId, ipAddress });
        res.json({
            success: true,
            data: result.logs,
            total: result.total,
            limit: result.limit,
            offset: result.offset
        });
    });

    // ============================================
    // 9. DÉBLOCAGE D'UNE IP BLOQUÉE (ADMIN ONLY)
    // ============================================
    router.post('/unblock-ip', requireRole('admin'), async (req, res) => {
        const { ip } = req.body || {};
        if (!ip) {
            return res.status(400).json({ success: false, error: 'Adresse IP requise.' });
        }

        await authService.clearFailedAttempts(ip);
        await authAuditService.logEvent({
            eventType: 'ROLE_ELEVATION',
            userId: req.user?.userId,
            username: req.user?.username,
            ipAddress: getClientIp(req),
            reason: `IP ${ip} débloquée manuellement par l'administrateur`
        });

        res.json({
            success: true,
            message: `L'adresse IP ${ip} a été débloquée avec succès.`
        });
    });

    return router;
}

module.exports = createAuthRouter;
