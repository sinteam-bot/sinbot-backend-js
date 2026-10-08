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
        const titleLower = (item.title || '').toLowerCase();
        const authorLower = (item.author || '').toLowerCase().replace('@', '').trim();

        // 1. Mots-clés requis (Include / filterKeywords) : au moins un doit être présent
        const includes = filters.includeKeywords || filters.filterKeywords;
        if (Array.isArray(includes) && includes.length > 0) {
            const hasInclude = includes.some(kw => {
                const k = (kw || '').trim().toLowerCase();
                return k && textToSearch.includes(k);
            });
            if (!hasInclude) return false;
        }

        // 2. Mots-clés exclus (Exclude) : aucun ne doit être présent
        const excludes = filters.excludeKeywords;
        if (Array.isArray(excludes) && excludes.length > 0) {
            const hasExclude = excludes.some(kw => {
                const k = (kw || '').trim().toLowerCase();
                return k && textToSearch.includes(k);
            });
            if (hasExclude) return false;
        }

        // 3. Mots-clés requis dans le titre uniquement
        const titleIncludes = filters.titleKeywords || filters.includeTitleKeywords;
        if (Array.isArray(titleIncludes) && titleIncludes.length > 0) {
            const hasTitle = titleIncludes.some(kw => {
                const k = (kw || '').trim().toLowerCase();
                return k && titleLower.includes(k);
            });
            if (!hasTitle) return false;
        }

        // 4. Mots-clés exclus du titre uniquement
        const titleExcludes = filters.excludeTitleKeywords;
        if (Array.isArray(titleExcludes) && titleExcludes.length > 0) {
            const hasForbiddenTitle = titleExcludes.some(kw => {
                const k = (kw || '').trim().toLowerCase();
                return k && titleLower.includes(k);
            });
            if (hasForbiddenTitle) return false;
        }

        // 5. Filtre d'auteurs (authorInclude / authorExclude)
        const authorIncludes = filters.authorInclude || filters.includeAuthors;
        if (Array.isArray(authorIncludes) && authorIncludes.length > 0) {
            const hasAuthor = authorIncludes.some(a => {
                const clean = (a || '').trim().toLowerCase().replace('@', '');
                return clean && authorLower.includes(clean);
            });
            if (!hasAuthor) return false;
        }

        const authorExcludes = filters.authorExclude || filters.excludeAuthors;
        if (Array.isArray(authorExcludes) && authorExcludes.length > 0) {
            const hasForbiddenAuthor = authorExcludes.some(a => {
                const clean = (a || '').trim().toLowerCase().replace('@', '');
                return clean && authorLower.includes(clean);
            });
            if (hasForbiddenAuthor) return false;
        }

        // 6. Filtre de tags / catégories
        const itemTags = Array.isArray(item.tags) ? item.tags.map(t => t.toLowerCase().replace('#', '')) : [];
        const tagIncludes = filters.tagInclude || filters.includeTags;
        if (Array.isArray(tagIncludes) && tagIncludes.length > 0) {
            const hasTag = tagIncludes.some(t => {
                const clean = (t || '').trim().toLowerCase().replace('#', '');
                return clean && itemTags.includes(clean);
            });
            if (!hasTag) return false;
        }

        const tagExcludes = filters.tagExclude || filters.excludeTags;
        if (Array.isArray(tagExcludes) && tagExcludes.length > 0) {
            const hasForbiddenTag = tagExcludes.some(t => {
                const clean = (t || '').trim().toLowerCase().replace('#', '');
                return clean && itemTags.includes(clean);
            });
            if (hasForbiddenTag) return false;
        }

        // 7. Filtre média obligatoire (requireMedia / requireImage)
        if (filters.requireMedia === true || filters.requireImage === true) {
            if (!item.imageUrl) return false;
        }

        // 8. Filtre Regex optionnel
        const regexPattern = filters.regexFilter || filters.regex;
        if (regexPattern && typeof regexPattern === 'string' && regexPattern.trim()) {
            try {
                const re = new RegExp(regexPattern.trim(), 'i');
                if (!re.test(textToSearch)) return false;
            } catch {
                // Regex invalide ignorée
            }
        }

        return true;
    }
}

module.exports = { BaseFeedProvider };
