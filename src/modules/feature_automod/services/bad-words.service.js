/**
 * BadWords — détecte les mots interdits dans un message
 *
 * Compile les patterns en regex une seule fois par configuration.
 * Supporte les modes case_sensitive et whole_word.
 */

class BadWords {
    constructor() {
        this._compiled = null;
        this._config = null;
    }

    _compile(config) {
        if (this._config === config) return this._compiled;
        this._config = config;
        if (!config.list || config.list.length === 0) {
            this._compiled = null;
            return null;
        }
        const escaped = config.list
            .filter(w => typeof w === 'string' && w.length > 0)
            .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (escaped.length === 0) {
            this._compiled = null;
            return null;
        }
        const flags = config.case_sensitive ? 'g' : 'gi';
        const pattern = config.whole_word
            ? `\\b(?:${escaped.join('|')})\\b`
            : `(?:${escaped.join('|')})`;
        this._compiled = new RegExp(pattern, flags);
        return this._compiled;
    }

    /**
     * Vérifie si un contenu contient un mot interdit
     * @param {string} content
     * @param {{ list: string[], case_sensitive?: boolean, whole_word?: boolean }} config
     * @returns {{ matched: boolean, word?: string }}
     */
    check(content, config) {
        if (!content) return { matched: false };
        const re = this._compile(config);
        if (!re) return { matched: false };
        const m = content.match(re);
        if (!m) return { matched: false };
        return { matched: true, word: m[0] };
    }

    /**
     * Indique si la liste est vide / non configurée
     */
    isEnabled(config) {
        return !!(config && config.list && config.list.length > 0 && config.enabled !== false);
    }

    reset() {
        this._compiled = null;
        this._config = null;
    }
}

module.exports = { BadWords };
