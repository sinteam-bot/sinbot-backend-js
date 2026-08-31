/**
 * security.js — Utilitaires de sécurité transversaux
 *
 * Fournit :
 *  - Comparaison de chaînes en temps constant (anti timing-attack)
 *  - Validation des identifiants Discord (snowflake)
 *  - Sanitisation et validation du contenu des messages
 *  - Configuration centralisée du rate limiting
 *
 * 🔒 Conseils d'amélioration future pour le système d'authentification :
 *   1. Remplacer la clé API statique par un système JWT (access + refresh tokens)
 *   2. Ajouter l'authentification OAuth2 Discord pour le dashboard
 *      (l'utilisateur se connecte via Discord, on vérifie ses rôles serveur)
 *   3. Implémenter un RBAC (Role-Based Access Control) :
 *      - admin   : accès complet à toute l'API
 *      - mod     : lecture + actions de modération
 *      - viewer  : lecture seule
 *   4. Ajouter un mécanisme de session avec expiration (Redis / en mémoire)
 *   5. Logger toutes les tentatives d'authentification (succès + échecs)
 *   6. Ajouter un mécanisme de blocage temporaire après N échecs consécutifs
 *   7. Forcer HTTPS en production (redirect HTTP → HTTPS)
 */

const crypto = require('crypto');

// ============================================
// 1. COMPARAISON EN TEMPS CONSTANT
// ============================================

/**
 * Compare deux chaînes en temps constant pour éviter les attaques temporelles (timing attacks).
 * Retourne `true` si les deux chaînes sont identiques, `false` sinon.
 *
 * @param {string} a - Première chaîne (ex: clé fournie par le client)
 * @param {string} b - Deuxième chaîne (ex: clé attendue côté serveur)
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length === 0 || b.length === 0) return false;

    // Encoder en UTF-8 pour garantir une comparaison byte-à-byte
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');

    // Si les longueurs diffèrent, on compare quand même pour éviter de révéler
    // cette information via le temps de réponse (on pad la plus courte)
    if (bufA.length !== bufB.length) {
        // On compare bufA contre lui-même pour consommer le même temps
        // puis on retourne false de manière inconditionnelle
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
}

// ============================================
// 2. VALIDATION DES IDENTIFIANTS DISCORD
// ============================================

/**
 * Vérifie qu'un identifiant est un Snowflake Discord valide.
 * Un snowflake est un entier 64 bits encodé en string (17 à 20 chiffres).
 *
 * @param {string} id
 * @returns {boolean}
 */
function isDiscordSnowflake(id) {
    if (typeof id !== 'string') return false;
    return /^\d{17,20}$/.test(id);
}

/**
 * Vérifie qu'un channelId est autorisé (pas un identifiant système ni vide).
 * Accepte les snowflakes Discord et les identifiants de salons virtuels (cat-*, virtual-*).
 *
 * @param {string} channelId
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateChannelId(channelId) {
    if (!channelId || typeof channelId !== 'string') {
        return { valid: false, reason: 'channelId manquant ou invalide' };
    }

    // Accepter les identifiants de salons virtuels du dashboard
    if (channelId.startsWith('cat-') || channelId.startsWith('virtual-')) {
        return { valid: true };
    }

    if (!isDiscordSnowflake(channelId)) {
        return { valid: false, reason: `channelId invalide : "${channelId}" n'est pas un identifiant Discord valide (snowflake attendu)` };
    }

    return { valid: true };
}

/**
 * Vérifie qu'un messageId est un snowflake valide.
 *
 * @param {string} messageId
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateMessageId(messageId) {
    if (!messageId || typeof messageId !== 'string') {
        return { valid: false, reason: 'messageId manquant ou invalide' };
    }

    if (!isDiscordSnowflake(messageId)) {
        return { valid: false, reason: `messageId invalide : "${messageId}" n'est pas un identifiant Discord valide` };
    }

    return { valid: true };
}

// ============================================
// 3. VALIDATION DU CONTENU DES MESSAGES
// ============================================

// Limite de caractères Discord pour un message
const DISCORD_MAX_MESSAGE_LENGTH = 2000;
// Limite raisonnable pour un titre de post forum
const DISCORD_MAX_TITLE_LENGTH = 100;

/**
 * Valide et sanitise le contenu d'un message Discord.
 *
 * @param {string} content
 * @param {object} [options]
 * @param {number} [options.maxLength=2000]
 * @param {boolean} [options.allowEmpty=false]
 * @returns {{ valid: boolean, sanitized?: string, reason?: string }}
 */
function validateMessageContent(content, options = {}) {
    const maxLength = options.maxLength || DISCORD_MAX_MESSAGE_LENGTH;
    const allowEmpty = options.allowEmpty || false;

    if (content === undefined || content === null) {
        return { valid: false, reason: 'Contenu du message manquant' };
    }

    if (typeof content !== 'string') {
        return { valid: false, reason: 'Le contenu doit être une chaîne de caractères' };
    }

    const trimmed = content.trim();

    if (!allowEmpty && trimmed.length === 0) {
        return { valid: false, reason: 'Contenu du message vide' };
    }

    if (trimmed.length > maxLength) {
        return { valid: false, reason: `Le message dépasse la limite de ${maxLength} caractères (${trimmed.length} reçus)` };
    }

    return { valid: true, sanitized: trimmed };
}

/**
 * Valide le contenu d'un embed Discord (vérification basique des limites).
 *
 * @param {object} embed
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateEmbed(embed) {
    if (!embed || typeof embed !== 'object') {
        return { valid: true }; // Pas d'embed = OK
    }

    // Limites Discord pour les embeds
    if (embed.title && embed.title.length > 256) {
        return { valid: false, reason: 'Le titre de l\'embed dépasse 256 caractères' };
    }
    if (embed.description && embed.description.length > 4096) {
        return { valid: false, reason: 'La description de l\'embed dépasse 4096 caractères' };
    }
    if (embed.fields && embed.fields.length > 25) {
        return { valid: false, reason: 'Un embed ne peut pas avoir plus de 25 champs' };
    }

    return { valid: true };
}

// ============================================
// 4. VÉRIFICATION D'ACCÈS AU GUILD
// ============================================

/**
 * Vérifie qu'un salon appartient bien au guild configuré du bot.
 * Empêche l'envoi de messages sur des serveurs tiers.
 *
 * @param {import('discord.js').Client} client
 * @param {string} channelId
 * @returns {Promise<{ allowed: boolean, channel?: object, reason?: string }>}
 */
async function verifyChannelBelongsToGuild(client, channelId) {
    if (!client || !client.isReady()) {
        return { allowed: false, reason: 'Bot Discord non connecté' };
    }

    const configuredGuildId = process.env.GUILD_ID;
    if (!configuredGuildId) {
        // Si pas de GUILD_ID configuré, on ne peut pas vérifier — on laisse passer
        // mais on log un warning
        return { allowed: true };
    }

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            return { allowed: false, reason: 'Salon introuvable' };
        }

        // Vérifier que le salon appartient au serveur configuré
        if (channel.guildId && channel.guildId !== configuredGuildId) {
            return { allowed: false, reason: 'Ce salon n\'appartient pas au serveur configuré' };
        }

        return { allowed: true, channel };
    } catch {
        return { allowed: false, reason: 'Impossible de vérifier le salon' };
    }
}

// ============================================
// 5. CONFIGURATION RATE LIMITING
// ============================================

const rateLimit = require('express-rate-limit');

function getClientIp(req) {
    try {
        const xff = req.headers && req.headers['x-forwarded-for'];
        if (xff) {
            const first = String(xff).split(',')[0].trim();
            if (first) return first;
        }
        if (req.ip && typeof req.ip === 'string') return req.ip;
    } catch (_) {}
    return req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
}

/**
 * Crée les middlewares de rate limiting pour les différentes zones de l'API.
 * @returns {object} Un objet contenant les middlewares nommés
 */
function createRateLimiters() {
    // Réponse standardisée pour les limites atteintes
    const rateLimitResponse = (req, res) => {
        res.status(429).json({
            success: false,
            error: 'Trop de requêtes. Veuillez réessayer dans quelques instants.',
            retryAfter: res.getHeader('Retry-After')
        });
    };

    return {
        // Rate limiter global pour l'ensemble de l'API
        // 120 requêtes par minute par IP
        global: rateLimit({
            windowMs: 60 * 1000,
            max: 120,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => getClientIp(req),
            validate: { trustProxy: false },
            handler: rateLimitResponse,
            skip: (req) => req.path === '/health'
        }),

        // Rate limiter strict pour l'authentification
        // 5 tentatives par 15 minutes par IP
        auth: rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 5,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => getClientIp(req),
            validate: { trustProxy: false },
            handler: rateLimitResponse,
            skipSuccessfulRequests: true
        }),

        // Rate limiter pour les webhooks
        // 10 requêtes par minute par IP
        webhook: rateLimit({
            windowMs: 60 * 1000,
            max: 10,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => getClientIp(req),
            validate: { trustProxy: false },
            handler: rateLimitResponse
        }),

        // Rate limiter pour les opérations d'écriture (POST/PATCH/DELETE sur messages)
        // 20 requêtes par minute par IP
        write: rateLimit({
            windowMs: 60 * 1000,
            max: 20,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => getClientIp(req),
            validate: { trustProxy: false },
            handler: rateLimitResponse
        }),

        // Rate limiter pour les endpoints de génération IA
        // 5 requêtes par minute par IP (consomme des tokens)
        aiGeneration: rateLimit({
            windowMs: 60 * 1000,
            max: 5,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => getClientIp(req),
            validate: { trustProxy: false },
            handler: rateLimitResponse
        }),

        // Rate limiter pour les opérations sensibles (config, sync, purge)
        // 10 requêtes par minute par IP
        sensitive: rateLimit({
            windowMs: 60 * 1000,
            max: 10,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => getClientIp(req),
            validate: { trustProxy: false },
            handler: rateLimitResponse
        })
    };
}

// ============================================
// 6. MIDDLEWARE EXPRESS DE VALIDATION
// ============================================

/**
 * Middleware Express qui valide les paramètres :channelId et :messageId des routes.
 * À monter sur les routeurs qui utilisent ces paramètres.
 */
function validateDiscordParamsMiddleware(req, res, next) {
    // Valider :channelId si présent dans les params
    if (req.params.channelId) {
        const check = validateChannelId(req.params.channelId);
        if (!check.valid) {
            return res.status(400).json({ success: false, error: check.reason });
        }
    }

    // Valider :messageId si présent dans les params
    if (req.params.messageId) {
        const check = validateMessageId(req.params.messageId);
        if (!check.valid) {
            return res.status(400).json({ success: false, error: check.reason });
        }
    }

    // Valider :userId si présent dans les params
    if (req.params.userId) {
        if (!isDiscordSnowflake(req.params.userId)) {
            return res.status(400).json({ success: false, error: `userId invalide : "${req.params.userId}"` });
        }
    }

    next();
}

// ============================================
// 7. MIDDLEWARES RBAC & AUTHENTIFICATION
// ============================================

/**
 * Récupère l'adresse IP réelle du client
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIp(req) {
    if (!req) return '127.0.0.1';
    return req.ip ||
           (req.headers && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
           req.socket?.remoteAddress ||
           '127.0.0.1';
}

/**
 * Middleware Express vérifiant si l'adresse IP du client est temporairement bloquée
 */
async function checkBruteForceBlocked(req, res, next) {
    try {
        const { authService } = require('../services/auth.service.js');
        const ip = getClientIp(req);
        const check = await authService.isBlocked(ip);

        if (check.isBlocked) {
            const seconds = Math.ceil(check.remainingMs / 1000);
            res.setHeader('Retry-After', String(seconds));
            return res.status(429).json({
                success: false,
                error: `Trop de tentatives d'authentification échouées. Votre adresse IP est temporairement bloquée pendant encore ${seconds} secondes.`,
                retryAfter: seconds
            });
        }
    } catch {
        // En cas d'erreur BDD, on laisse passer pour ne pas bloquer tout le service
    }
    next();
}

/**
 * Middleware d'authentification globale (JWT Bearer ou Clé API système)
 */
function authenticateMiddleware(options = {}) {
    return (req, res, next) => {
        const { getConfig, config } = require('../config/index.js');
        const curConfig = getConfig ? getConfig() : config;
        const authConfig = curConfig.web?.auth || {};

        // 1. Si l'authentification est désactivée globalement
        if (!authConfig.enabled) {
            req.user = { userId: 'anonymous', username: 'Anonyme', role: 'admin', isAnonymous: true };
            return next();
        }

        // 2. Endpoints toujours publics
        const publicPaths = [
            '/health',
            '/api/auth/status',
            '/api/auth/discord/login',
            '/api/auth/discord/callback',
            '/api/auth/refresh',
            '/api/auth/verify',
            '/api/auth/unblock-ip'
        ];

        if (publicPaths.includes(req.path) || req.path.startsWith('/api/proxy/')) {
            return next();
        }

        // 3. Vérification de la liste blanche d'adresses IP si configurée
        const clientIp = getClientIp(req);
        if (authConfig.allowed_ips && Array.isArray(authConfig.allowed_ips) && authConfig.allowed_ips.length > 0) {
            if (authConfig.allowed_ips.includes(clientIp) || clientIp === '127.0.0.1' || clientIp === '::1') {
                req.user = { userId: 'whitelisted_ip', role: 'admin' };
                return next();
            }
        }

        // 4. Extraction du token JWT Bearer
        const authHeader = req.headers['authorization'];
        let token = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
        }

        if (token) {
            const { authService } = require('../services/auth.service.js');
            const decoded = authService.verifyAccessToken(token);
            if (decoded) {
                req.user = {
                    userId: decoded.sub,
                    username: decoded.username,
                    avatarUrl: decoded.avatar,
                    role: decoded.role || 'viewer',
                    sessionId: decoded.sessionId
                };
                return next();
            }
        }

        // 5. Fallback : Clé API système (x-api-key)
        const apiKey = req.headers['x-api-key'];
        if (apiKey && authConfig.api_key && timingSafeEqual(apiKey, authConfig.api_key)) {
            req.user = {
                userId: 'system_api_key',
                username: 'System API Key',
                role: 'admin',
                isApiKey: true
            };
            return next();
        }

        // 6. Refus d'accès 401
        if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
            return res.status(401).json({
                success: false,
                error: 'Accès non autorisé : Token JWT ou Clé API manquant ou invalide.'
            });
        }

        if (authConfig.protect_static) {
            return res.status(401).send(`
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"><title>401 - Accès Protégé</title></head>
                <body style="font-family:sans-serif;text-align:center;padding:50px;background:#1e1f22;color:#fff;">
                    <h2>🔒 Accès Protégé</h2>
                    <p>Veuillez vous connecter avec Discord pour accéder au tableau de bord.</p>
                    <a href="/api/auth/discord/login" style="display:inline-block;padding:10px 20px;background:#5865F2;color:#fff;text-decoration:none;border-radius:4px;margin-top:15px;">Se connecter avec Discord</a>
                </body>
                </html>
            `);
        }

        next();
    };
}

/**
 * Middleware RBAC : restreint l'accès aux rôles spécifiés
 * Hiérarchie : admin > mod > viewer
 * @param {string|Array<string>} roles - Rôle(s) autorisé(s) ('admin', 'mod', 'viewer')
 */
function requireRole(roles) {
    const allowed = Array.isArray(roles) ? roles : [roles];

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Authentification requise.' });
        }

        const userRole = req.user.role || 'viewer';

        // L'administrateur a tous les droits
        if (userRole === 'admin') {
            return next();
        }

        // Si le rôle requis est 'viewer', tous les utilisateurs authentifiés passent
        if (allowed.includes('viewer')) {
            return next();
        }

        // Si le rôle requis est 'mod', admin et mod passent
        if (allowed.includes('mod') && (userRole === 'mod' || userRole === 'admin')) {
            return next();
        }

        // Si le rôle correspond exactement
        if (allowed.includes(userRole)) {
            return next();
        }

        return res.status(403).json({
            success: false,
            error: `Accès refusé : Permissions insuffisantes. Rôle requis : [${allowed.join(', ')}], votre rôle : "${userRole}".`
        });
    };
}

module.exports = {
    timingSafeEqual,
    isDiscordSnowflake,
    validateChannelId,
    validateMessageId,
    validateMessageContent,
    validateEmbed,
    verifyChannelBelongsToGuild,
    createRateLimiters,
    validateDiscordParamsMiddleware,
    getClientIp,
    checkBruteForceBlocked,
    authenticateMiddleware,
    requireRole,
    DISCORD_MAX_MESSAGE_LENGTH,
    DISCORD_MAX_TITLE_LENGTH
};

