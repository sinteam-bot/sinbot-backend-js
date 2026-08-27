const crypto = require('crypto');
const logger = require('../utils/logger.js');

/**
 * Service de proxy et de cache haute-performance pour les images Discord
 * (Avatars, Émojis, Rôles, Attachements, Bannières, Icônes de Serveur)
 * 
 * Évite les avertissements de cookies tiers cross-site (__cf_bm, __dcfduid, __sdcfduid)
 * et accélère considérablement l'affichage grâce au cache mémoire LRU + ETag HTTP 304.
 */
class ImageProxyService {
    constructor() {
        this.cache = new Map();
        this.maxEntries = 500;
        this.defaultTtlMs = 24 * 60 * 60 * 1000; // 24 heures

        // Liste des domaines autorisés pour le proxy
        this.allowedHostnames = [
            'cdn.discordapp.com',
            'media.discordapp.net',
            'images-ext-1.discordapp.net',
            'images-ext-2.discordapp.net',
            'discord.com',
            'discordapp.com',
            'raw.githubusercontent.com',
            'avatars.githubusercontent.com',
            'cdn.jsdelivr.net'
        ];

        // 1x1 transparent PNG buffer pour les fallbacks ultimes
        this.transparentPng = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64'
        );

        // SVG Discord Default Avatar Blurple
        this.defaultAvatarSvg = Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
              <rect width="128" height="128" rx="64" fill="#5865F2"/>
              <path d="M89.5 38.5c-6.8-3.1-14.1-5.4-21.7-6.6-.9 1.7-2 3.9-2.7 5.6-8.2-1.2-16.3-1.2-24.3 0-.7-1.7-1.8-3.9-2.7-5.6-7.7 1.3-14.9 3.5-21.7 6.6-13.8 20.6-17.5 40.7-15.6 60.5 9.1 6.7 17.9 10.8 26.6 13.5 2.1-2.9 4-6 5.6-9.3-3.1-1.2-6.1-2.7-8.9-4.5.7-.5 1.5-1.1 2.2-1.6 17.2 7.9 35.8 7.9 52.8 0 .7.6 1.4 1.1 2.2 1.6-2.8 1.8-5.7 3.3-8.9 4.5 1.6 3.3 3.5 6.4 5.6 9.3 8.7-2.7 17.5-6.8 26.6-13.5 2.3-23.2-3.8-43.1-15.3-60.5zM45.5 73.5c-5.2 0-9.5-4.8-9.5-10.7 0-5.9 4.2-10.7 9.5-10.7 5.4 0 9.6 4.9 9.5 10.7 0 5.9-4.2 10.7-9.5 10.7zm37 0c-5.2 0-9.5-4.8-9.5-10.7 0-5.9 4.2-10.7 9.5-10.7 5.4 0 9.6 4.9 9.5 10.7 0 5.9-4.2 10.7-9.5 10.7z" fill="#FFFFFF"/>
            </svg>`,
            'utf-8'
        );
    }

    /**
     * Valide la sécurité d'une URL
     */
    isValidUrl(targetUrl) {
        if (!targetUrl || typeof targetUrl !== 'string') return false;

        try {
            const parsed = new URL(targetUrl);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return false;
            }

            const hostname = parsed.hostname.toLowerCase();

            // Bloquer localhost et les adresses IP privées (SSRF protection)
            if (
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname === '::1' ||
                hostname === '0.0.0.0' ||
                hostname.startsWith('10.') ||
                hostname.startsWith('192.168.') ||
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
                hostname.endsWith('.internal') ||
                hostname.endsWith('.local')
            ) {
                return false;
            }

            // Vérifier si le domaine est dans la liste autorisée
            return this.allowedHostnames.some(allowed => hostname === allowed || hostname.endsWith(`.${allowed}`));
        } catch {
            return false;
        }
    }

    /**
     * Récupère une image depuis le cache ou la télécharge
     */
    async fetchImage(targetUrl) {
        if (!this.isValidUrl(targetUrl)) {
            throw new Error(`URL non autorisée ou invalide: ${targetUrl}`);
        }

        const now = Date.now();

        // 1. Vérifier dans le cache mémoire
        if (this.cache.has(targetUrl)) {
            const entry = this.cache.get(targetUrl);
            if (entry.expiresAt > now) {
                // Remettre en fin de map pour LRU
                this.cache.delete(targetUrl);
                this.cache.set(targetUrl, entry);
                return entry;
            } else {
                this.cache.delete(targetUrl);
            }
        }

        // 2. Télécharger l'image depuis Discord CDN
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000);

            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DiscordBotDashboard/1.0',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                // Si l'image n'existe plus ou est expirée sur le CDN
                logger.warn(`Échec téléchargement image (${response.status}) : ${targetUrl}`, 'IMAGE_PROXY');
                return this.getFallbackEntry(targetUrl);
            }

            const contentType = response.headers.get('content-type') || 'image/png';
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Calcul de l'ETag
            const etag = `W/"${crypto.createHash('md5').update(buffer).digest('hex')}"`;

            const entry = {
                buffer,
                contentType,
                etag,
                expiresAt: now + this.defaultTtlMs
            };

            // Gestion de la capacité max du cache LRU
            if (this.cache.size >= this.maxEntries) {
                const firstKey = this.cache.keys().next().value;
                if (firstKey) this.cache.delete(firstKey);
            }

            this.cache.set(targetUrl, entry);
            return entry;
        } catch (error) {
            logger.error(`Erreur réseau proxy image: ${error.message} (${targetUrl})`, 'IMAGE_PROXY');
            return this.getFallbackEntry(targetUrl);
        }
    }

    /**
     * Fournit un fallback gracieux selon le type d'URL
     */
    getFallbackEntry(targetUrl) {
        if (targetUrl && (targetUrl.includes('/avatars/') || targetUrl.includes('/embed/avatars/'))) {
            return {
                buffer: this.defaultAvatarSvg,
                contentType: 'image/svg+xml',
                etag: 'W/"default-avatar-svg"',
                expiresAt: Date.now() + 3600000
            };
        }

        return {
            buffer: this.transparentPng,
            contentType: 'image/png',
            etag: 'W/"fallback-transparent-png"',
            expiresAt: Date.now() + 3600000
        };
    }

    /**
     * Middleware Express pour servir l'image avec gestion ETag 304 et headers de cache
     */
    async handleRequest(req, res) {
        const targetUrl = req.query.url;

        if (!targetUrl) {
            return res.status(400).json({ error: 'Paramètre ?url= requis' });
        }

        try {
            const entry = await this.fetchImage(targetUrl);

            // Gestion de l'ETag client (304 Not Modified)
            const clientEtag = req.headers['if-none-match'];
            if (clientEtag && clientEtag === entry.etag) {
                res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, immutable');
                res.setHeader('ETag', entry.etag);
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(304).end();
            }

            // Headers de cache et sécurité (pas de cookies transmis)
            res.setHeader('Content-Type', entry.contentType);
            res.setHeader('Content-Length', entry.buffer.length);
            res.setHeader('ETag', entry.etag);
            res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, immutable');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.removeHeader('Set-Cookie');

            return res.status(200).send(entry.buffer);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }
}

const imageProxyService = new ImageProxyService();
module.exports = { ImageProxyService, imageProxyService };
