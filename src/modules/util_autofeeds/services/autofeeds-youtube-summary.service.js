/**
 * src/modules/util_autofeeds/services/autofeeds-youtube-summary.service.js
 *
 * Résumeur de vidéo YouTube (YouTube Transcript Summarizer).
 * Extrait les sous-titres/transcription (timedtext) d'une vidéo YouTube
 * et génère une synthèse IA structurée (Accroche + 3 à 5 points clés + Timestamps).
 */

const { callChatGPT } = require('../../../utils/openrouter.js');
const { logger } = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');

class AutofeedsYouTubeSummaryService {
    constructor(callAiFn = callChatGPT) {
        this.callAi = callAiFn;
        this.cache = new Map();
        this.MAX_CACHE_SIZE = 200;
    }

    /**
     * Extrait l'identifiant unique à 11 caractères d'une vidéo YouTube depuis une URL.
     * @param {string} url 
     * @returns {string|null} videoId ou null
     */
    extractVideoId(url) {
        if (!url || typeof url !== 'string') return null;
        const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i;
        const match = url.match(regExp);
        return match ? match[1] : null;
    }

    /**
     * Récupère le titre et l'auteur d'une vidéo via l'endpoint public oEmbed officiel de YouTube.
     * @param {string} videoId 
     * @returns {Promise<{ title: string, author: string }|null>}
     */
    async fetchVideoDetails(videoId) {
        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return null;
            const data = await res.json();
            return {
                title: data.title || '',
                author: data.author_name || ''
            };
        } catch {
            return null;
        }
    }

    /**
     * Tente d'extraire la transcription (sous-titres) via timedtext.
     * @param {string} videoId 
     * @returns {Promise<string|null>}
     */
    async fetchTranscript(videoId) {
        // Essai sur langues courantes : français puis anglais
        const langs = ['fr', 'en', 'auto'];

        for (const lang of langs) {
            try {
                const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`;
                const res = await fetch(timedtextUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: AbortSignal.timeout(5000)
                });

                if (res.ok) {
                    const xml = await res.text();
                    if (xml && xml.includes('<text')) {
                        // Extraction et nettoyage du XML des sous-titres
                        const cleaned = xml
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/&amp;/g, '&')
                            .replace(/&#39;/g, "'")
                            .replace(/&quot;/g, '"')
                            .replace(/\s+/g, ' ')
                            .trim();

                        if (cleaned.length > 50) {
                            return cleaned;
                        }
                    }
                }
            } catch {
                // Continuation vers la langue suivante
            }
        }

        return null;
    }

    /**
     * Génère la synthèse d'une vidéo YouTube.
     * @param {Object} params
     * @param {string} params.url URL YouTube
     * @param {string} [params.videoId] ID optionnel
     * @param {string} [params.title] Titre optionnel
     * @param {string} [params.description] Description optionnelle
     * @returns {Promise<{ summary: string, videoId: string, hasTranscript: boolean, title: string }>}
     */
    async summarizeVideo({ url, videoId = null, title = null, description = null }) {
        const id = videoId || this.extractVideoId(url);
        if (!id) {
            throw new Error("Impossible d'extraire l'identifiant YouTube depuis l'URL fournie.");
        }

        if (this.cache.has(id)) {
            return this.cache.get(id);
        }

        let videoTitle = title;
        let videoAuthor = '';

        if (!videoTitle) {
            const details = await this.fetchVideoDetails(id);
            if (details) {
                videoTitle = details.title;
                videoAuthor = details.author;
            }
        }

        // Tente de récupérer la transcription textuelle
        let transcript = await this.fetchTranscript(id);
        const hasTranscript = Boolean(transcript && transcript.length > 50);

        // Si pas de transcription, on utilise la description et le titre
        const textToSummarize = hasTranscript 
            ? transcript.slice(0, 4500)
            : (description || videoTitle || 'Pas de transcription disponible').slice(0, 2000);

        const prompt = `Résume la vidéo YouTube suivante en français pour une communauté Discord :
Titre : ${videoTitle || 'Vidéo YouTube'} ${videoAuthor ? `par ${videoAuthor}` : ''}
${hasTranscript ? 'Contenu de la transcription :' : 'Description / Aperçu :'}
${textToSummarize}

Format de réponse attendu :
- Une courte phrase d'accroche qui résume le sujet central.
- 3 à 5 points clés concis et percutants commençant chacun par "📌 ".
- (Optionnel) Si des timestamps/moments clés ou chapitres sont mentionnés, indique-les à la fin sous "⏱️ Moments clés :".
Sois factuel, dynamique et sans phrases de remplissage.`;

        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es un assistant éditorial expert en synthèse vidéo YouTube pour une communauté Discord tech et gaming.",
                maxTokens: 350,
                temperature: 0.3,
                allowFallback: true
            });

            const summary = (typeof res === 'string' ? res : (res?.result || '')).trim();

            const result = {
                summary: summary || "Impossible de générer le résumé de cette vidéo.",
                videoId: id,
                hasTranscript,
                title: videoTitle || 'Vidéo YouTube'
            };

            if (this.cache.size >= this.MAX_CACHE_SIZE) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            this.cache.set(id, result);

            return result;
        } catch (err) {
            logger.error(`[AutofeedsYouTubeSummary] Échec résumé vidéo ${id}: ${err.message}`, 'AUTOFEEDS_YOUTUBE');
            throw new Error(`Échec de la synthèse vidéo: ${err.message}`);
        }
    }
}

Injectable()(AutofeedsYouTubeSummaryService);

const autofeedsYouTubeSummaryService = new AutofeedsYouTubeSummaryService();

module.exports = {
    AutofeedsYouTubeSummaryService,
    autofeedsYouTubeSummaryService
};
