/**
 * src/modules/util_autofeeds/services/autofeeds-ai.service.js
 *
 * Service d'enrichissement IA pour les flux (synthèse TL;DR en 2-3 puces, traduction)
 * utilisant le moteur OpenRouter et ses politiques de résilience.
 */

const { callChatGPT } = require('../../../utils/openrouter.js');
const { logger } = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');

class AutofeedsAiService {
    constructor(callAiFn = callChatGPT) {
        this.callAi = callAiFn;
        // Cache en mémoire pour éviter les ré-appels coûteux sur le même article
        this.cache = new Map();
        this.MAX_CACHE_SIZE = 500;
    }

    _getCacheKey(prefix, item) {
        return `${prefix}:${item.id || item.link || item.title}`;
    }

    _setCache(key, val) {
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, val);
    }

    /**
     * Génère un résumé TL;DR concis en 2 ou 3 puces pour un article.
     * @param {Object} item - Article du flux
     * @returns {Promise<string|null>} Résumé en puces ou null en cas d'échec
     */
    async generateSummary(item) {
        if (!item || (!item.title && !item.content)) return null;

        const key = this._getCacheKey('summary', item);
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const textSample = (item.content || item.description || item.title || '').slice(0, 1500);

        const prompt = `Résume l'article suivant en exactement 2 ou 3 points clés concis et percutants en français (TL;DR). Chaque point DOIT impérativement commencer par '• '. Pas d'introduction, pas de conclusion, uniquement les puces.

Titre: ${item.title || 'Sans titre'}
Contenu: ${textSample}`;

        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es un assistant éditorial de synthèse d'actualités pour une communauté Discord. Sois ultra-concis, factuel et percutant.",
                maxTokens: 180,
                temperature: 0.3,
                allowFallback: true
            });

            const summary = (typeof res === 'string' ? res : (res?.result || '')).trim();
            if (summary && summary.length > 5) {
                this._setCache(key, summary);
                return summary;
            }
            return null;
        } catch (err) {
            logger.warn(`[AutofeedsAiService] Échec génération résumé TL;DR: ${err.message}`, 'AUTOFEEDS_AI');
            return null;
        }
    }

    /**
     * Traduit le titre ou contenu d'un article vers la langue cible (ex: 'fr').
     * @param {Object} item - Article du flux
     * @param {string} targetLang - Code de langue (ex: 'fr')
     * @returns {Promise<{ title: string, description: string }|null>}
     */
    async translateItem(item, targetLang = 'fr') {
        if (!item || !item.title) return null;

        const key = this._getCacheKey(`trans_${targetLang}`, item);
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const prompt = `Traduire en français fidèlement le titre et le court extrait suivant :
Titre: ${item.title}
Extrait: ${(item.content || item.description || '').slice(0, 400)}

Réponds strictement au format JSON suivant sans fioriture :
{ "title": "titre traduit", "description": "extrait traduit" }`;

        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es un traducteur bilingue spécialisé dans les jeux vidéo et la tech.",
                maxTokens: 250,
                temperature: 0.2,
                allowFallback: true
            });

            const raw = (typeof res === 'string' ? res : (res?.result || '')).trim();
            let parsed = null;

            try {
                const cleanJson = raw.replace(/^```json/i, '').replace(/```$/i, '').trim();
                parsed = JSON.parse(cleanJson);
            } catch {
                const titleMatch = raw.match(/TITRE\s*:\s*([^\n]+)/i);
                const contentMatch = raw.match(/CONTENU\s*:\s*([\s\S]+)/i);
                if (titleMatch || contentMatch) {
                    parsed = {
                        title: titleMatch ? titleMatch[1].trim() : item.title,
                        description: contentMatch ? contentMatch[1].trim() : ''
                    };
                }
            }

            if (!parsed && raw) {
                parsed = {
                    title: item.title,
                    description: raw
                };
            }

            if (parsed && (parsed.title || parsed.description)) {
                this._setCache(key, parsed);
                return parsed;
            }
            return null;
        } catch (err) {
            logger.warn(`[AutofeedsAiService] Échec traduction article: ${err.message}`, 'AUTOFEEDS_AI');
            return null;
        }
    }

    /**
     * Effectue la synthèse combinée (résumé TL;DR et traduction)
     */
    async generateSummaryAndTranslation(item, targetLang = 'fr') {
        const summary = await this.generateSummary(item);
        const trans = await this.translateItem(item, targetLang);
        return {
            summary,
            translatedTitle: trans?.title || null,
            translatedContent: trans?.description || null
        };
    }
}

Injectable()(AutofeedsAiService);

module.exports = { AutofeedsAiService };
