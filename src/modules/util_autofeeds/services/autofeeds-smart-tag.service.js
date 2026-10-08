/**
 * src/modules/util_autofeeds/services/autofeeds-smart-tag.service.js
 *
 * Smart Tagging & Taxonomie IA Automatique (Zéro-Config).
 * Analyse automatiquement le titre et le contenu d'un article pour en déduire
 * 2 à 4 tags pertinents et canoniques lorsque le flux RSS source n'en fournit pas.
 */

const { callChatGPT } = require('../../../utils/openrouter.js');
const logger = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');

class AutofeedsSmartTagService {
    constructor(callAiFn = callChatGPT) {
        this.callAi = callAiFn;
        this.cache = new Map();
        this.MAX_CACHE_SIZE = 500;

        // Dictionnaire taxonomique canonique de mots-clés fréquents
        this.canonicalTaxonomy = {
            'gaming': ['jeu', 'game', 'gameplay', 'gaming', 'joueur', 'studio', 'steam', 'epic games'],
            'rpg': ['rpg', 'jeu de rôle', 'action-rpg', 'mmorpg', 'jrpg'],
            'playstation': ['ps5', 'ps4', 'playstation', 'sony interactive', 'dualsense'],
            'xbox': ['xbox', 'series x', 'series s', 'game pass', 'microsoft gaming'],
            'nintendo': ['nintendo', 'switch', 'switch 2', 'mario', 'zelda', 'pokemon'],
            'pc': ['pc master race', 'nvidia', 'geforce', 'rtx', 'amd', 'radeon', 'intel'],
            'hardware': ['hardware', 'processeur', 'carte graphique', 'composant', 'console', 'écran'],
            'patchnotes': ['mise à jour', 'patch', 'patch notes', 'update', 'hotfix', 'correctif', 'changelog'],
            'esport': ['esport', 'e-sport', 'tournoi', 'championship', 'major', 'worlds', 'roster'],
            'cinema': ['cinéma', 'film', 'série', 'box-office', 'bande-annonce', 'trailer', 'netflix', 'hbo', 'disney+'],
            'tech': ['intelligence artificielle', 'ia', 'ai', 'smartphone', 'apple', 'google', 'android', 'cyber']
        };
    }

    /**
     * Déduit 2 à 4 tags canoniques pour un article donné.
     * @param {Object} item
     * @param {string} item.title
     * @param {string} [item.content]
     * @param {string} [item.contentSnippet]
     * @param {string[]} [existingTags]
     * @returns {Promise<string[]>} Liste de tags enrichis
     */
    async deriveTags(item, existingTags = []) {
        if (!item || (!item.title && !item.content)) {
            return Array.isArray(existingTags) ? existingTags : [];
        }

        const initialTags = Array.isArray(existingTags)
            ? existingTags.map(t => String(t).toLowerCase().trim().replace(/^#/, ''))
            : [];

        // Si l'article possède déjà au moins 3 tags pertinents, on les conserve
        if (initialTags.length >= 3) {
            return initialTags;
        }

        const cacheKey = `smart_tags:${item.id || item.link || item.title}`;
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            return Array.from(new Set([...initialTags, ...cached]));
        }

        const title = item.title || '';
        const body = (item.contentSnippet || item.content || '').slice(0, 1000);
        const combined = `${title} ${body}`.toLowerCase();

        // 1. Détection taxonomique heuristique instantanée
        const matchedTaxa = [];
        for (const [tag, keywords] of Object.entries(this.canonicalTaxonomy)) {
            for (const kw of keywords) {
                if (combined.includes(kw)) {
                    matchedTaxa.push(tag);
                    break;
                }
            }
        }

        // Si l'heuristique a trouvé 2 tags ou plus, on l'utilise sans consommer de tokens IA
        if (matchedTaxa.length >= 2) {
            const finalTags = Array.from(new Set([...initialTags, ...matchedTaxa])).slice(0, 4);
            this._saveCache(cacheKey, finalTags);
            return finalTags;
        }

        // 2. Déduction IA via OpenRouter si l'heuristique est insuffisante
        const prompt = `Déduis exactement 2 à 4 tags canoniques courts (un seul mot en minuscules chacun, ex: rpg, ps5, esport, trailer, patch) pour cette actualité :
Titre: ${title}
Extrait: ${body.slice(0, 400)}

Réponds STRICTEMENT par la liste des tags séparés par des virgules (ex: tech, mobile, apple), sans aucun autre texte.`;

        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es un classificateur de taxonomie d'actualités. Retourne uniquement des tags en minuscules séparés par des virgules.",
                maxTokens: 50,
                temperature: 0.1,
                allowFallback: true
            });

            const raw = typeof res === 'string' ? res : (res?.result || '');
            const parsedTags = raw.split(',')
                .map(t => t.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_-]/g, ''))
                .filter(t => t.length >= 2 && t.length <= 20);

            const merged = Array.from(new Set([...initialTags, ...matchedTaxa, ...parsedTags])).slice(0, 4);
            const resTags = merged.length > 0 ? merged : ['actu', 'news'];
            this._saveCache(cacheKey, resTags);
            return resTags;
        } catch (err) {
            logger.warn(`[AutofeedsSmartTag] Échec appel IA tags: ${err.message}`, 'AUTOFEEDS_SMART_TAG');
            const fallback = Array.from(new Set([...initialTags, ...matchedTaxa, 'actualite'])).slice(0, 4);
            return fallback;
        }
    }

    _saveCache(key, val) {
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            const first = this.cache.keys().next().value;
            this.cache.delete(first);
        }
        this.cache.set(key, val);
    }
}

const autofeedsSmartTagService = new AutofeedsSmartTagService();
Injectable()(AutofeedsSmartTagService);

module.exports = {
    AutofeedsSmartTagService,
    autofeedsSmartTagService
};
