/**
 * src/modules/util_autofeeds/services/autofeeds-clustering.service.js
 *
 * Service de déduplication cross-flux et de clustering d'actualités (Story Clustering) :
 * - Normalisation des URLs canoniques (retrait des trackers UTM, ref, fbclid...)
 * - Détection de similarité textuelle sur les titres et résumés (Jaccard + N-grammes)
 * - Agrégation des sources secondaires (relatedSources) pour enrichir l'histoire existante
 */

const { Injectable } = require('../../../core/index.js');

class AutofeedsClusteringService {
    constructor(threshold = 0.60) {
        this.defaultThreshold = threshold;
        this.stopWords = new Set([
            // Français
            'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'd', 'l', 'et', 'en', 'dans', 'sur',
            'pour', 'par', 'avec', 'est', 'sont', 'a', 'ont', 'fait', 'plus', 'ce', 'cette', 'ces',
            'qui', 'que', 'quoi', 'dont', 'où', 'ne', 'pas', 'se', 'sa', 'son', 'ses', 'leur', 'leurs',
            // Anglais
            'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'about',
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'this', 'that', 'new'
        ]);
    }

    /**
     * Normalise une URL en supprimant les paramètres de pistage et ancres.
     * @param {string} rawUrl
     * @returns {string} URL canonique
     */
    normalizeUrl(rawUrl = '') {
        if (!rawUrl || typeof rawUrl !== 'string') return '';
        try {
            const parsed = new URL(rawUrl.trim());
            const trackingKeys = [
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                'ref', 'ref_src', 'fbclid', 'gclid', 'msclkid', 'affiliate', 'subid', 'tag'
            ];
            for (const key of trackingKeys) {
                parsed.searchParams.delete(key);
            }
            parsed.hash = '';
            let clean = parsed.toString();
            if (clean.endsWith('/') && parsed.pathname !== '/') {
                clean = clean.slice(0, -1);
            }
            return clean;
        } catch {
            return rawUrl.trim().toLowerCase().split('?')[0].replace(/\/+$/, '');
        }
    }

    /**
     * Tokenise un texte en un ensemble de mots-clés normalisés sans accents ni stopwords.
     * @param {string} text
     * @returns {Set<string>}
     */
    tokenize(text = '') {
        if (!text || typeof text !== 'string') return new Set();
        const tokens = text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !this.stopWords.has(w));
        return new Set(tokens);
    }

    /**
     * Calcule le coefficient de similarité de Jaccard entre deux chaînes ou ensembles.
     * @param {string|Set<string>} textOrSetA
     * @param {string|Set<string>} textOrSetB
     * @returns {number} Score entre 0.0 et 1.0
     */
    calculateSimilarity(textOrSetA = '', textOrSetB = '') {
        const setA = textOrSetA instanceof Set ? textOrSetA : this.tokenize(textOrSetA);
        const setB = textOrSetB instanceof Set ? textOrSetB : this.tokenize(textOrSetB);
        if (setA.size === 0 || setB.size === 0) return 0;

        let intersection = 0;
        for (const token of setA) {
            if (setB.has(token)) intersection++;
        }

        const union = new Set([...setA, ...setB]).size;
        return union === 0 ? 0 : intersection / union;
    }

    computeTitleSimilarity(textA = '', textB = '') {
        return this.calculateSimilarity(textA, textB);
    }

    isExactDuplicate(urlA = '', urlB = '') {
        const canA = this.normalizeUrl(urlA);
        const canB = this.normalizeUrl(urlB);
        return Boolean(canA && canB && canA === canB);
    }

    /**
     * Recherche si un nouvel article correspond à un article déjà publié récemment.
     * @param {Object} newItem Nouvel article { title, url, link }
     * @param {Array<Object>} recentHistory Liste d'items récents
     * @param {number} [threshold] Seuil de similarité (défaut: 0.60)
     * @returns {Object|null} Le candidat avec score ou null
     */
    findClusterCandidate(newItem, recentHistory = [], threshold = null) {
        if (!newItem || !Array.isArray(recentHistory) || recentHistory.length === 0) return null;

        const actualThreshold = threshold !== null ? threshold : this.defaultThreshold;
        const newCanonical = this.normalizeUrl(newItem.url || newItem.link);

        for (const prev of recentHistory) {
            const prevCanonical = this.normalizeUrl(prev.canonicalUrl || prev.url || prev.link);

            // 1. URL canonique identique = doublon certain (100%)
            if (newCanonical && prevCanonical && newCanonical === prevCanonical) {
                return {
                    ...prev,
                    id: prev.id,
                    candidate: prev,
                    score: 1.0,
                    reason: 'exact_url'
                };
            }

            // 2. Similarité de titre
            const score = this.calculateSimilarity(newItem.title || '', prev.title || '');
            if (score >= actualThreshold) {
                return {
                    ...prev,
                    id: prev.id,
                    candidate: prev,
                    score,
                    reason: 'title_similarity'
                };
            }
        }

        return null;
    }

    findMatchingCluster(newItem, recentHistory = [], threshold = null) {
        return this.findClusterCandidate(newItem, recentHistory, threshold);
    }

    /**
     * Crée une source liée pour la fusion de cluster.
     * @param {Object} feed Flux source
     * @param {Object} item Nouvel article
     * @returns {Object}
     */
    createRelatedSourceEntry(feed, item) {
        return {
            feedId: feed?.id || 'unknown',
            feedName: feed?.name || 'Autre source',
            title: item?.title || 'Article lié',
            link: item?.link || item?.url || '#',
            publishedAt: item?.pubDate || item?.publishedAt || new Date().toISOString()
        };
    }

    /**
     * Construit une mention de source liée à ajouter au message existant.
     * @param {string} feedName Nom du flux secondaire
     * @param {string} title Titre du relais
     * @param {string} url Lien
     * @returns {string}
     */
    formatSecondarySource(feedName, title, url) {
        const cleanTitle = (title || 'Source').slice(0, 60);
        return `📎 **${feedName || 'Autre source'}** : [${cleanTitle}](${url})`;
    }
}

Injectable()(AutofeedsClusteringService);

const autofeedsClusteringService = new AutofeedsClusteringService();

module.exports = {
    AutofeedsClusteringService,
    autofeedsClusteringService
};
