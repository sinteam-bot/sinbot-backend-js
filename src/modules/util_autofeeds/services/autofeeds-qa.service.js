/**
 * src/modules/util_autofeeds/services/autofeeds-qa.service.js
 *
 * Assistant IA Dédié à l'Article (Thread Q&A / "Pose une question sur cette actu").
 * Répond avec rigueur et précision aux questions de la communauté en se basant
 * sur le contenu complet extrait par le Reader Service.
 */

const { callChatGPT } = require('../../../utils/openrouter.js');
const { logger } = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');
const { autofeedsReaderService } = require('./autofeeds-reader.service.js');

class AutofeedsQaService {
    constructor(callAiFn = callChatGPT, readerService = autofeedsReaderService) {
        this.callAi = callAiFn;
        this.readerService = readerService;
        this.qaCache = new Map();
        this.MAX_CACHE_SIZE = 200;
    }

    _getCacheKey(url, question) {
        return `${url.trim()}::${question.trim().toLowerCase()}`;
    }

    /**
     * Répond à une question spécifique posée sur un article.
     * @param {Object} params
     * @param {string} params.url URL de l'article
     * @param {string} params.question Question de l'utilisateur
     * @param {string} [params.articleTitle] Titre optionnel pré-fourni
     * @param {string} [params.articleContent] Contenu optionnel pré-fourni
     * @returns {Promise<{ answer: string, title: string, url: string, wordCount: number }>}
     */
    async answerQuestion({ url, question, articleTitle = null, articleContent = null }) {
        if (!question || typeof question !== 'string' || !question.trim()) {
            throw new Error('La question posée ne peut pas être vide.');
        }

        const cacheKey = this._getCacheKey(url || 'nourl', question);
        if (this.qaCache.has(cacheKey)) {
            return this.qaCache.get(cacheKey);
        }

        let title = articleTitle;
        let content = articleContent;
        let wordCount = 0;

        // Si le contenu n'est pas fourni et qu'une URL est présente, on l'extrait via le Reader Service
        if (!content && url) {
            try {
                const article = await this.readerService.extractCleanArticle(url);
                title = title || article.title;
                content = article.textContent || article.text;
                wordCount = article.wordCount || 0;
            } catch (err) {
                logger.warn(`[AutofeedsQaService] Échec extraction Reader pour ${url}: ${err.message}`, 'AUTOFEEDS_QA');
                // En cas d'échec de fetch, on utilise le titre comme contexte minimal
                content = `Titre: ${title || url}`;
            }
        }

        const cleanContext = (content || title || '').slice(0, 3500);

        const prompt = `Voici le contenu d'un article d'actualité :
---
Titre: ${title || 'Sans titre'}
Contenu:
${cleanContext}
---

Question de l'utilisateur : "${question.trim()}"

Consignes pour la réponse :
1. Réponds de manière claire, concise (max 3 ou 4 phrases) et pédagogique en français.
2. Base-toi EXCLUSIVEMENT et rigoureusement sur les faits exposés dans l'article.
3. Si l'information demandée n'est pas mentionnée dans l'article, dis-le poliment et simplement sans inventer.
4. N'inclus aucune formule de politesse superflue (ex: "Bonjour", "J'espère que cela t'aide").`;

        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es un assistant IA d'actualités Discord rigoureux et factuel. Réponds aux questions sur les articles avec précision sans halluciner.",
                maxTokens: 300,
                temperature: 0.2,
                allowFallback: true
            });

            const answer = (typeof res === 'string' ? res : (res?.result || '')).trim();
            const result = {
                answer: answer || "Désolé, je n'ai pas pu analyser la réponse pour cette question.",
                title: title || 'Article',
                url: url || '',
                wordCount
            };

            if (this.qaCache.size >= this.MAX_CACHE_SIZE) {
                const firstKey = this.qaCache.keys().next().value;
                this.qaCache.delete(firstKey);
            }
            this.qaCache.set(cacheKey, result);

            return result;
        } catch (err) {
            logger.error(`[AutofeedsQaService] Erreur lors de l'appel IA Q&A: ${err.message}`, 'AUTOFEEDS_QA');
            throw new Error(`Erreur lors de la réponse IA: ${err.message}`);
        }
    }
}

Injectable()(AutofeedsQaService);

const autofeedsQaService = new AutofeedsQaService();

module.exports = {
    AutofeedsQaService,
    autofeedsQaService
};
