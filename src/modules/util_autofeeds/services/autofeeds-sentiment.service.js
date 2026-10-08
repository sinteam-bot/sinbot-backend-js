/**
 * autofeeds-sentiment.service.js
 * 
 * Filtre d'Humeur & "Good Vibes Only" (Analyse de Sentiment).
 * Évalue la polarité émotionnelle d'un article (-1.0 à +1.0)
 * et permet d'écarter les mauvaises nouvelles dans les salons chill.
 */

const POSITIVE_LEXICON = new Set([
    'victoire', 'succès', 'record', 'gratuit', 'cadeau', 'célébration',
    'magnifique', 'génial', 'récompense', 'joie', 'innovation', 'félicitations',
    'fête', 'triomphe', 'bonheur', 'superbe', 'parfait', 'enthousiaste',
    'win', 'success', 'free', 'gift', 'amazing', 'awesome', 'celebrate',
    'great', 'breakthrough', 'congrats', 'wonderful', 'triumph', 'love', 'joy'
]);

const NEGATIVE_LEXICON = new Set([
    'mort', 'guerre', 'licenciement', 'faillite', 'crise', 'drama',
    'arnaque', 'fermeture', 'annulation', 'faille', 'catastrophe', 'accident',
    'piratage', 'plainte', 'départ', 'escroquerie', 'triste', 'deuil', 'blessé',
    'death', 'war', 'layoff', 'bankrupt', 'crisis', 'cancel', 'cancelled',
    'scam', 'shutdown', 'hack', 'exploit', 'lawsuit', 'sad', 'fatal', 'kill'
]);

class AutofeedsSentimentService {
    /**
     * Analyse le sentiment d'un texte et/ou d'un titre.
     * @param {string} text
     * @param {string} [title]
     * @returns {{ score: number, category: 'positive'|'neutral'|'negative', badgeText: string }}
     */
    analyzeSentiment(text = '', title = '') {
        const fullContent = `${title || ''} ${text || ''}`.toLowerCase();
        const words = fullContent.split(/[\s,.;:!?()[\]{}"'’«»/-]+/).filter(w => w.length > 2);

        if (words.length === 0) {
            return {
                score: 0,
                category: 'neutral',
                badgeText: '🟡 Info Neutre'
            };
        }

        let positiveHits = 0;
        let negativeHits = 0;

        for (const word of words) {
            if (POSITIVE_LEXICON.has(word)) positiveHits++;
            if (NEGATIVE_LEXICON.has(word)) negativeHits++;
        }

        const totalHits = positiveHits + negativeHits;
        let rawScore = 0;
        if (totalHits > 0) {
            rawScore = (positiveHits - negativeHits) / totalHits;
        }

        // Arrondi à 2 décimales
        const score = Math.round(rawScore * 100) / 100;

        let category = 'neutral';
        let badgeText = '🟡 Info Neutre';

        if (score >= 0.2) {
            category = 'positive';
            badgeText = '🟢 Bonne Nouvelle !';
        } else if (score <= -0.2) {
            category = 'negative';
            badgeText = '⚠️ Sujet Sensible';
        }

        return {
            score,
            category,
            badgeText,
            positiveHits,
            negativeHits
        };
    }

    /**
     * Calcule uniquement le score numérique de polarité (-1.0 à +1.0).
     */
    calculateSentiment(text = '', title = '') {
        return this.analyzeSentiment(text, title).score;
    }

    /**
     * Détermine si un article doit être filtré lorsque le mode "Good Vibes Only" est activé.
     * @param {number} score
     * @param {boolean} goodVibesOnly
     * @returns {boolean} true si l'article est négatif et doit être bloqué
     */
    shouldFilterGoodVibes(score, goodVibesOnly = false) {
        if (!goodVibesOnly) return false;
        return Number(score || 0) <= -0.15;
    }

    /**
     * Vérifie directement si un texte ou un article doit être filtré.
     */
    shouldFilterItem(itemOrText, goodVibesOnly = false) {
        if (!goodVibesOnly) return false;
        const text = typeof itemOrText === 'string'
            ? itemOrText
            : `${itemOrText?.title || ''} ${itemOrText?.summary || itemOrText?.contentSnippet || ''}`;
        const score = this.calculateSentiment(text);
        return this.shouldFilterGoodVibes(score, goodVibesOnly);
    }
}

const autofeedsSentimentService = new AutofeedsSentimentService();

module.exports = {
    AutofeedsSentimentService,
    autofeedsSentimentService
};
