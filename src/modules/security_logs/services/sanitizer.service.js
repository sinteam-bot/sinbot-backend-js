/**
 * Sanitizer — nettoie les contenus loggés pour éviter de re-poster
 * du contenu NSFW, des spoils, des images explicites, ou des liens
 * malveillants.
 *
 * Règles :
 *  - Tronque au-delà de max_length (défaut 1024)
 *  - Remplace les URLs par un placeholder, sauf si domaine whitelisté
 *  - Neutralise les balises et caractères spéciaux pour les embeds
 *  - Les attachments ne sont jamais ré-uploadés : on n'envoie que le nom
 */

class Sanitizer {
    constructor(config = {}) {
        this.maxLength = config.max_content_length || 1024;
        this.whitelistDomains = (config.whitelist_domains || ['discord.com', 'discord.gg', 'github.com']).map(d => d.toLowerCase());
    }

    setConfig(config) {
        this.maxLength = config?.settings?.max_content_length || this.maxLength;
        if (Array.isArray(config?.whitelist_domains)) {
            this.whitelistDomains = config.whitelist_domains.map(d => d.toLowerCase());
        }
    }

    /**
     * Nettoie un contenu texte
     */
    cleanContent(content) {
        if (!content) return '';
        let s = String(content);
        s = s.replace(/https?:\/\/\S+/gi, (url) => {
            try {
                const u = new URL(url);
                if (this.whitelistDomains.includes(u.hostname.toLowerCase())) {
                    return url;
                }
                return '`<lien masqué>`';
            } catch {
                return '`<lien invalide>`';
            }
        });
        if (s.length > this.maxLength) {
            s = s.slice(0, this.maxLength - 3) + '...';
        }
        return s;
    }

    /**
     * Décrit un attachment (nom + contentType, jamais l'URL)
     */
    describeAttachments(attachments) {
        if (!Array.isArray(attachments) || attachments.length === 0) return [];
        return attachments.map(a => ({
            name: a.name || a.filename || 'fichier',
            contentType: a.contentType || a.content_type || null,
            size: a.size || null
        }));
    }

    /**
     * Nettoie un nom d'utilisateur (enlève les caractères spéciaux pour les embeds)
     */
    cleanUsername(name) {
        if (!name) return '';
        return String(name).replace(/[*_`~\\]/g, '');
    }

    /**
     * Tronque avec un ellipsis
     */
    truncate(str, len = 100) {
        if (!str) return '';
        const s = String(str);
        return s.length > len ? s.slice(0, len - 1) + '…' : s;
    }
}

module.exports = { Sanitizer };
