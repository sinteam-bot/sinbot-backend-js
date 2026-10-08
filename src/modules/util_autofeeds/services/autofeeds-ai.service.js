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

    /**
     * Traduit uniquement le titre d'un article vers la langue cible (ex: 'fr').
     * @param {string} title 
     * @param {string} targetLang 
     * @returns {Promise<string|null>}
     */
    async translateTitle(title, targetLang = 'fr') {
        if (!title || typeof title !== 'string') return null;

        const key = this._getCacheKey(`title_trans_${targetLang}`, { title });
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const prompt = `Traduis fidèlement ce titre d'actualité en français naturel et percutant. Ne réponds QUE par le titre traduit, aucun autre texte, pas de guillemets :
"${title}"`;

        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es un traducteur de presse bilingue anglais-français.",
                maxTokens: 80,
                temperature: 0.2,
                allowFallback: true
            });

            const translated = (typeof res === 'string' ? res : (res?.result || '')).trim().replace(/^["']|["']$/g, '');
            if (translated && translated.length > 2) {
                this._setCache(key, translated);
                return translated;
            }
            return title;
        } catch (err) {
            logger.warn(`[AutofeedsAiService] Échec traduction titre: ${err.message}`, 'AUTOFEEDS_AI');
            return title;
        }
    }

    /**
     * Détecte et reformule les titres clickbait/sensationnalistes en titres factuels.
     * @param {Object} item { title, description, content }
     * @returns {Promise<{ isClickbait: boolean, sanitizedTitle: string, originalTitle: string }>}
     */
    async sanitizeClickbaitTitle(item) {
        if (!item || !item.title) {
            return { isClickbait: false, sanitizedTitle: item?.title || '', originalTitle: item?.title || '' };
        }

        const title = item.title;
        const key = this._getCacheKey('clickbait', item);
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        // Heuristique rapide de détection clickbait
        const clickbaitPatterns = [
            /\b(vous ne devinerez jamais|incroyable|choc|hallucinant|voici pourquoi|cette astuce va|cette erreur que|tout le monde|va vous surprendre)\b/i,
            /\b(won't believe|shocking|insane|this changes everything|wait until|everyone is talking about|secret revealed)\b/i,
            /[!?]{2,}/,
            /\b[A-Z]{4,}\b/ // Mot en majuscules crié
        ];

        const suspicious = clickbaitPatterns.some(p => p.test(title));
        if (!suspicious) {
            const result = { isClickbait: false, sanitizedTitle: title, originalTitle: title };
            this._setCache(key, result);
            return result;
        }

        const sample = (item.description || item.content || '').slice(0, 800);
        const prompt = `Voici le titre potentiellement sensationnaliste ou "clickbait" d'un article et son contexte :
Titre : "${title}"
Extrait : "${sample}"

Tâche :
1. Détermine si le titre est racoleur ou sensationnaliste (clickbait).
2. Si oui, reformule-le en un titre sobre, factuel, précis et neutre en français qui révèle directement l'information sans mystère artificiel.
3. Si le titre était déjà sobre et informatif, conserve-le.

Réponds STRICTEMENT au format JSON :
{
  "isClickbait": true/false,
  "sanitizedTitle": "titre sobre et factuel"
}`;

        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es un éditeur en chef anti-désinformation et anti-clickbait.",
                maxTokens: 120,
                temperature: 0.2,
                allowFallback: true
            });

            const raw = (typeof res === 'string' ? res : (res?.result || '')).trim();
            const cleanJson = raw.replace(/^```json/i, '').replace(/```$/i, '').trim();
            const parsed = JSON.parse(cleanJson);

            const result = {
                isClickbait: Boolean(parsed.isClickbait),
                sanitizedTitle: parsed.sanitizedTitle || title,
                originalTitle: title
            };

            this._setCache(key, result);
            return result;
        } catch (err) {
            logger.warn(`[AutofeedsAiService] Échec analyse anti-clickbait: ${err.message}`, 'AUTOFEEDS_AI');
            return { isClickbait: false, sanitizedTitle: title, originalTitle: title };
        }
    }
}

Injectable()(AutofeedsAiService);

module.exports = { AutofeedsAiService };
