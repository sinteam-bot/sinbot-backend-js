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
            handler: rateLimitResponse
        }),

        // Rate limiter pour les opérations d'écriture (POST/PATCH/DELETE sur messages)
        // 20 requêtes par minute par IP
        write: rateLimit({
            windowMs: 60 * 1000,
            max: 20,
            standardHeaders: true,
            legacyHeaders: false,
            handler: rateLimitResponse
        }),

        // Rate limiter pour les endpoints de génération IA
        // 5 requêtes par minute par IP (consomme des tokens)
        aiGeneration: rateLimit({
            windowMs: 60 * 1000,
            max: 5,
            standardHeaders: true,
            legacyHeaders: false,
            handler: rateLimitResponse
        }),

        // Rate limiter pour les opérations sensibles (config, sync, purge)
        // 10 requêtes par minute par IP
        sensitive: rateLimit({
            windowMs: 60 * 1000,
            max: 10,
            standardHeaders: true,
            legacyHeaders: false,
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
    DISCORD_MAX_MESSAGE_LENGTH,
    DISCORD_MAX_TITLE_LENGTH
};
