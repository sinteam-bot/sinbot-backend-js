/**
 * autofeeds-security.service.js
 * 
 * Déplieur d'URLs Raccourcies & Bouclier Anti-Phishing (Smart Link Unshortener).
 * Déplie les liens opaques (bit.ly, t.co...) et vérifie la sécurité des destinations.
 */

const logger = require('../../../utils/logger');

const KNOWN_SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
    'buff.ly', 'amzn.to', 'ift.tt', 'trib.al', 'cutt.ly', 'shorturl.at',
    'rb.gy', 'linktr.ee', 'rebrand.ly', 'bl.ink'
]);

const DANGEROUS_EXTENSIONS = /\.(exe|scr|bat|cmd|msi|vbs|apk|iso|pif|reg)$/i;

const PHISHING_PATTERNS = [
    /discor[ccl]d(?:-|\.)(?:gift|nitro|free|claim)/i,
    /nitro(?:-|\.)(?:discord|gift|free|airdrop)/i,
    /steam(?:-|\.)?(?:communitly|community-trade|tradeoffer-gift|wallet-free)/i,
    /free-(?:robux|vbucks|nitro|crypto-airdrop)/i
];

class AutofeedsSecurityService {
    /**
     * Vérifie si un lien provient d'un service de raccourcissement connu.
     * @param {string} urlStr
     * @returns {boolean}
     */
    isShortenedUrl(urlStr) {
        if (!urlStr) return false;
        try {
            const parsed = new URL(urlStr);
            const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
            return KNOWN_SHORTENERS.has(host);
        } catch {
            return false;
        }
    }

    /**
     * Déplie une URL raccourcie en suivant les redirections HTTP successives.
     * @param {string} urlStr
     * @param {number} [maxHops=5]
     * @returns {Promise<string>}
     */
    async unshortenUrl(urlStr, maxHops = 5) {
        if (!this.isShortenedUrl(urlStr)) {
            return urlStr;
        }

        let currentUrl = urlStr;
        let hops = 0;

        while (hops < maxHops) {
            try {
                const response = await fetch(currentUrl, {
                    method: 'HEAD',
                    redirect: 'manual',
                    signal: AbortSignal.timeout(3000)
                });

                const status = response.status;
                if ([301, 302, 303, 307, 308].includes(status)) {
                    const location = response.headers.get('location');
                    if (!location) break;

                    const nextUrl = new URL(location, currentUrl).toString();
                    currentUrl = nextUrl;
                    hops++;

                    if (!this.isShortenedUrl(currentUrl)) {
                        break;
                    }
                } else {
                    break;
                }
            } catch (err) {
                logger.debug(`[AutofeedsSecurity] Échec du suivi de redirection: ${err.message}`, 'AUTOFEEDS');
                break;
            }
        }

        return currentUrl;
    }

    /**
     * Analyse immédiate de la structure d'une URL (anti-phishing et extensions dangereuses).
     * @param {string} urlStr 
     * @returns {{ safe: boolean, reason?: string, expandedUrl: string }}
     */
    isSafeUrl(urlStr) {
        if (!urlStr) return { safe: true, expandedUrl: urlStr };
        try {
            const parsed = new URL(urlStr);
            const pathname = parsed.pathname.toLowerCase();
            const host = parsed.hostname.toLowerCase();

            if (DANGEROUS_EXTENSIONS.test(pathname)) {
                return {
                    safe: false,
                    reason: `Lien direct vers un fichier exécutable potentiellement dangereux (.${pathname.split('.').pop()})`,
                    expandedUrl: urlStr
                };
            }

            const combined = `${host}${pathname}`;
            for (const pattern of PHISHING_PATTERNS) {
                if (pattern.test(combined)) {
                    return {
                        safe: false,
                        reason: 'Lien suspect identifié comme tentative de phishing / hameçonnage',
                        expandedUrl: urlStr
                    };
                }
            }

            return { safe: true, expandedUrl: urlStr };
        } catch {
            return { safe: false, reason: 'URL malformée ou invalide', expandedUrl: urlStr };
        }
    }

    /**
     * Évalue la sécurité d'une URL (anti-phishing, extensions dangereuses, motifs frauduleux).
     * @param {string} urlStr
     * @returns {Promise<{ safe: boolean, reason?: string, expandedUrl: string }>}
     */
    async checkUrlSafety(urlStr) {
        if (!urlStr) return { safe: true, expandedUrl: urlStr };

        let expandedUrl = urlStr;
        if (this.isShortenedUrl(urlStr)) {
            expandedUrl = await this.unshortenUrl(urlStr);
        }

        try {
            const parsed = new URL(expandedUrl);
            const pathname = parsed.pathname.toLowerCase();
            const host = parsed.hostname.toLowerCase();

            // 1. Détection d'extensions exécutables directes
            if (DANGEROUS_EXTENSIONS.test(pathname)) {
                return {
                    safe: false,
                    reason: 'Lien direct vers un fichier exécutable potentiellement dangereux',
                    expandedUrl
                };
            }

            // 2. Détection de motifs de phishing connus
            const combined = `${host}${pathname}`;
            for (const pattern of PHISHING_PATTERNS) {
                if (pattern.test(combined)) {
                    return {
                        safe: false,
                        reason: 'Domaine suspect identifié comme tentative de phishing ou arnaque Nitro/Steam',
                        expandedUrl
                    };
                }
            }

            // 3. Détection d'homoglyphes / Punycode suspect
            if (host.startsWith('xn--')) {
                return {
                    safe: false,
                    reason: 'Nom de domaine internationalisé (Punycode) masquant potentiellement un nom de marque',
                    expandedUrl
                };
            }

            return { safe: true, expandedUrl };
        } catch {
            return { safe: false, reason: 'URL invalide ou mal formée', expandedUrl };
        }
    }
}

const autofeedsSecurityService = new AutofeedsSecurityService();

module.exports = {
    AutofeedsSecurityService,
    autofeedsSecurityService
};
