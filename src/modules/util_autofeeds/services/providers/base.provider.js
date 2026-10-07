/**
 * src/modules/util_autofeeds/services/providers/base.provider.js
 *
 * Classe de base pour les fournisseurs de flux (RSS, YouTube, Reddit, etc.).
 */

class BaseFeedProvider {
    constructor({ name, label, icon, description }) {
        this.name = name;
        this.label = label;
        this.icon = icon;
        this.description = description;
    }

    /**
     * Résout ou normalise l'URL du flux à partir d'une saisie utilisateur.
     * @param {string} input URL ou identifiant (ex: @Chaine, r/subreddit)
     * @returns {string} URL finale
     */
    resolveUrl(input) {
        return (input || '').trim();
    }

    /**
     * Récupère et normalise les éléments du flux.
     * @param {Object} feed
     * @returns {Promise<Array<Object>>}
     */
    async fetchItems(feed) {
        throw new Error(`fetchItems non implémenté pour le provider ${this.name}`);
    }

    /**
     * Nettoie les balises HTML d'un texte.
     */
    cleanHtml(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Vérifie si un élément passe les filtres de mots-clés configurés.
     * @param {Object} item
     * @param {Object} filters
     * @returns {boolean}
     */
    matchesFilters(item, filters = {}) {
        if (!filters || typeof filters !== 'object') return true;

        const textToSearch = `${item.title || ''} ${item.content || ''}`.toLowerCase();

        // 1. Mots-clés requis (Include) : au moins un doit être présent
        if (Array.isArray(filters.includeKeywords) && filters.includeKeywords.length > 0) {
            const hasInclude = filters.includeKeywords.some(kw => {
                const k = (kw || '').trim().toLowerCase();
                return k && textToSearch.includes(k);
            });
            if (!hasInclude) return false;
        }

        // 2. Mots-clés exclus (Exclude) : aucun ne doit être présent
        if (Array.isArray(filters.excludeKeywords) && filters.excludeKeywords.length > 0) {
            const hasExclude = filters.excludeKeywords.some(kw => {
                const k = (kw || '').trim().toLowerCase();
                return k && textToSearch.includes(k);
            });
            if (hasExclude) return false;
        }

        // 3. Filtre Regex optionnel
        if (filters.regexFilter && typeof filters.regexFilter === 'string' && filters.regexFilter.trim()) {
            try {
                const re = new RegExp(filters.regexFilter.trim(), 'i');
                if (!re.test(textToSearch)) return false;
            } catch {
                // Regex invalide ignorée
            }
        }

        return true;
    }
}

module.exports = { BaseFeedProvider };
