/**
 * src/modules/util_autofeeds/services/autofeeds-investigation.service.js
 *
 * Analyse Critique "Pour & Contre", Fact-Check IA et Méta-Enquête Multi-Sources.
 * Fournit l'évaluation de fiabilité/biais d'un article ainsi que la génération
 * d'une frise chronologique et synthèse d'enquête multi-flux (/feed investigate).
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { callChatGPT } = require('../../../utils/openrouter.js');
const logger = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');
const { autofeedsRepository } = require('./autofeeds.repository.js');
const { autofeedsReaderService } = require('./autofeeds-reader.service.js');

class AutofeedsInvestigationService {
    constructor(repository = autofeedsRepository, callAiFn = callChatGPT, readerService = autofeedsReaderService) {
        this.repository = repository;
        this.callAi = callAiFn;
        this.readerService = readerService;
        this.cache = new Map();
        this.MAX_CACHE_SIZE = 200;
    }

    /**
     * Analyse critique et fact-check d'un article unique.
     * @param {Object} params
     * @param {string} [params.url]
     * @param {string} [params.title]
     * @param {string} [params.content]
     * @param {string|number} [params.historyId]
     * @returns {Promise<{ pros: string[], cons: string[], score: number, verdict: string, explanation: string, url: string, title: string }>}
     */
    async analyzeArticleBalanceAndReliability({ url = null, title = null, content = null, historyId = null }) {
        let articleTitle = title;
        let articleContent = content;
        let articleUrl = url;

        if (historyId) {
            const hist = await this.repository.getHistoryItemById(historyId);
            if (hist) {
                articleTitle = articleTitle || hist.title;
                articleUrl = articleUrl || hist.link;
                articleContent = articleContent || hist.itemContent || hist.summary;
            }
        }

        if (!articleContent && articleUrl && this.readerService) {
            try {
                const extracted = await this.readerService.extractCleanArticle(articleUrl);
                articleTitle = articleTitle || extracted.title;
                articleContent = extracted.textContent || extracted.text;
            } catch (err) {
                logger.warn(`[InvestigationService] Échec extraction reader pour ${articleUrl}: ${err.message}`, 'AUTOFEEDS_INVESTIGATE');
            }
        }

        const sample = (articleContent || articleTitle || 'Article inconnu').slice(0, 3000);
        const cacheKey = `factcheck:${articleUrl || articleTitle || historyId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const prompt = `Effectue une analyse critique, fact-check et pesée "Pour & Contre" (ou Nuances/Limites) de cet article :
---
Titre: ${articleTitle || 'Sans titre'}
Contenu:
${sample}
---

Réponds STRICTEMENT sous ce format JSON valide sans markdown supplémentaire :
{
  "pros": ["Point fort ou argument en faveur 1", "Point fort 2"],
  "cons": ["Point faible, nuance ou contre-argument 1", "Point faible 2"],
  "score": 85,
  "verdict": "Fiable et sourcé",
  "explanation": "Explication synthétique en 2 phrases du niveau de fiabilité et de rigueur journalistique."
}`;

        let parsed = null;
        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es un expert en vérification des faits (fact-checking) et analyse critique de presse. Tu évalues la rigueur, les sources et la véracité avec impartialité.",
                maxTokens: 500,
                temperature: 0.2,
                allowFallback: true
            });

            const raw = typeof res === 'string' ? res : (res?.result || '');
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
        } catch (err) {
            logger.warn(`[InvestigationService] Erreur appel IA fact-check: ${err.message}`, 'AUTOFEEDS_INVESTIGATE');
        }

        // Fallback heuristique si l'IA est indisponible ou échoit
        if (!parsed || !Array.isArray(parsed.pros) || typeof parsed.score !== 'number') {
            parsed = this._heuristicFactCheck(articleTitle, sample);
        }

        const result = {
            pros: Array.isArray(parsed.pros) && parsed.pros.length > 0 ? parsed.pros : ['Information factuelle rapportée sans contradiction majeure.'],
            cons: Array.isArray(parsed.cons) && parsed.cons.length > 0 ? parsed.cons : ['Nécessite confirmation ultérieure auprès d\'autres canaux officiels.'],
            score: Math.min(100, Math.max(0, parseInt(parsed.score, 10) || 75)),
            verdict: parsed.verdict || (parsed.score >= 70 ? 'Plutôt Fiable' : 'À prendre avec précaution'),
            explanation: parsed.explanation || 'Évaluation automatique basée sur la cohérence textuelle et la transparence des sources.',
            title: articleTitle || 'Article analysé',
            url: articleUrl || ''
        };

        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            const first = this.cache.keys().next().value;
            this.cache.delete(first);
        }
        this.cache.set(cacheKey, result);

        // Sauvegarde de l'indice de fiabilité dans l'historique si historyId disponible
        if (historyId) {
            try {
                const { db } = require('../../../core/database/index.js');
                await db.pool.query(
                    `UPDATE autofeed_history SET fact_check_score = $1 WHERE id = $2`,
                    [result.score, historyId]
                );
            } catch (saveErr) {
                logger.warn(`[InvestigationService] Échec update fact_check_score: ${saveErr.message}`, 'AUTOFEEDS_INVESTIGATE');
            }
        }

        return result;
    }

    /**
     * Analyse heuristique déterministe en l'absence d'IA.
     */
    _heuristicFactCheck(title = '', content = '') {
        const text = `${title} ${content}`.toLowerCase();
        let score = 80;
        const cons = [];
        const pros = [];

        // Mots sensationnalistes / clickbait réduisant la fiabilité
        const sensationalWords = ['incroyable', 'choquant', 'choc', 'secret', 'ce détail', 'buzz', 'énorme', 'dingue', 'scandale'];
        const foundSensational = sensationalWords.filter(w => text.includes(w));
        if (foundSensational.length > 0) {
            score -= foundSensational.length * 8;
            cons.push(`Vocabulaire sensationnaliste détecté (${foundSensational.slice(0, 3).join(', ')}).`);
        }

        // Mention de sources officielles augmentant la fiabilité
        const officialWords = ['officiel', 'communiqué', 'porte-parole', 'étude', 'déclaré', 'rapport', 'source', 'confirme'];
        const foundOfficial = officialWords.filter(w => text.includes(w));
        if (foundOfficial.length > 0) {
            score += Math.min(20, foundOfficial.length * 5);
            pros.push(`Références à des sources identifiables ou déclarations directes (${foundOfficial.slice(0, 3).join(', ')}).`);
        } else {
            cons.push('Absence de citation explicite de source primaire ou de communiqué.');
            score -= 10;
        }

        if (pros.length === 0) {
            pros.push('Contenu cohérent et structuré.');
        }

        score = Math.max(25, Math.min(95, score));
        let verdict = 'Fiable & Vérifié';
        if (score < 50) verdict = 'Très Spéculatif / Douteux';
        else if (score < 70) verdict = 'Prudence / Sources Non Confirmées';

        return {
            pros,
            cons,
            score,
            verdict,
            explanation: `Évaluation heuristique basée sur le vocabulaire et les citations (Fiabilité estimée : ${score}%).`
        };
    }

    /**
     * Construit l'embed Discord de Fact-Check & Pour/Contre.
     */
    buildFactCheckEmbed({ title, url, pros, cons, score, verdict, explanation }) {
        let color = 0x57F287; // Vert fiable
        let icon = '🛡️';
        if (score < 50) {
            color = 0xED4245; // Rouge
            icon = '⚠️';
        } else if (score < 75) {
            color = 0xFEE75C; // Jaune
            icon = '🔍';
        }

        const prosText = (pros || []).map(p => `• ${p}`).join('\n') || 'Aucun argument notable.';
        const consText = (cons || []).map(c => `• ${c}`).join('\n') || 'Aucune réserve majeure.';

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${icon} Fact-Check & Analyse : ${title ? title.slice(0, 200) : 'Article'}`)
            .setDescription(`**Verdict :** \`${verdict}\` (Indice de fiabilité : **${score}/100**)\n${explanation}`)
            .addFields(
                { name: '🟢 Pour / Faits Établis', value: prosText.slice(0, 1024), inline: false },
                { name: '🔴 Contre / Réserves & Nuances', value: consText.slice(0, 1024), inline: false }
            )
            .setFooter({ text: 'Analyse Critique IA & Fact-Check • Chienne Bot' })
            .setTimestamp();

        if (url) {
            embed.setURL(url);
        }

        return embed;
    }

    /**
     * Construit le bouton Discord pour lancer un fact-check.
     */
    createFactCheckButton(historyId) {
        return new ButtonBuilder()
            .setCustomId(`feed_factcheck:${historyId}`)
            .setLabel('⚖️ Fact-Check & Nuances')
            .setEmoji('⚖️')
            .setStyle(ButtonStyle.Secondary);
    }

    /**
     * Méta-Enquête & Frise Chronologique (/feed investigate <sujet>).
     * Croise tous les articles de l'historique sur un sujet donné.
     * @param {Object} params
     * @param {string} params.guildId
     * @param {string} params.topic
     * @param {number} [params.limit]
     * @returns {Promise<{ topic: string, timeline: Array<{ date: string, title: string, source: string, url: string }>, consensus: string, discrepancies: string, consensusScore: number, sourcesCount: number }>}
     */
    async investigateTopic({ guildId, topic, limit = 8 }) {
        if (!guildId || !topic || !topic.trim()) {
            throw new Error('Paramètres manquants pour l\'enquête (guildId, topic).');
        }

        const items = await this.repository.searchHistoryByTopic(guildId, topic.trim(), limit);
        if (!items || items.length === 0) {
            return {
                topic: topic.trim(),
                timeline: [],
                consensus: `Aucun article trouvé dans l'historique du serveur correspondant au sujet "${topic}".`,
                discrepancies: 'N/A',
                consensusScore: 0,
                sourcesCount: 0
            };
        }

        // Construction de la chronologie (du plus ancien au plus récent)
        const sorted = [...items].sort((a, b) => a.postedAt - b.postedAt);
        const timeline = sorted.map(it => {
            const d = new Date(it.postedAt);
            const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
            return {
                date: dateStr,
                title: it.title,
                source: it.feedName || 'Flux',
                url: it.link || it.canonicalUrl || ''
            };
        });

        // Synthèse IA de consensus et détection des contradictions
        const articlesContext = sorted.map((it, idx) => `[#${idx + 1}] Date: ${new Date(it.postedAt).toISOString().slice(0, 10)} | Source: ${it.feedName || 'Inconnu'} | Titre: ${it.title} | Résumé: ${(it.itemContent || '').slice(0, 300)}`).join('\n\n');

        const prompt = `Voici plusieurs articles parus au fil du temps sur le sujet "${topic}" :
---
${articlesContext}
---

Génère une méta-enquête journalistique et réponds STRICTEMENT sous format JSON valide :
{
  "consensus": "Synthèse factuelle claire des faits avérés et de l'évolution de la situation en 3-4 phrases.",
  "discrepancies": "Points de divergence, rumeurs démenties ou contradictions relevées entre les sources (max 2 phrases).",
  "consensusScore": 85
}`;

        let parsed = null;
        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es un enquêteur en journalisme de données capable de recouper plusieurs sources et de distinguer les faits des contradictions.",
                maxTokens: 500,
                temperature: 0.2,
                allowFallback: true
            });
            const raw = typeof res === 'string' ? res : (res?.result || '');
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch (err) {
            logger.warn(`[InvestigationService] Erreur appel IA méta-enquête: ${err.message}`, 'AUTOFEEDS_INVESTIGATE');
        }

        return {
            topic: topic.trim(),
            timeline,
            consensus: parsed?.consensus || `L'affaire regroupe ${sorted.length} publication(s) recensée(s). Les éléments concordent vers une actualité continue.`,
            discrepancies: parsed?.discrepancies || 'Aucune contradiction majeure relevée entre les différents flux.',
            consensusScore: Math.min(100, Math.max(0, parseInt(parsed?.consensusScore, 10) || 80)),
            sourcesCount: sorted.length
        };
    }

    /**
     * Construit l'embed Discord de la méta-enquête et frise chronologique.
     */
    buildInvestigationEmbed({ topic, timeline, consensus, discrepancies, consensusScore, sourcesCount }) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Blurple enquête
            .setTitle(`🔍 Méta-Enquête & Frise Chronologique : "${topic}"`)
            .setDescription(`**Niveau de Consensus :** \`${consensusScore}%\` (${sourcesCount} source(s) analysée(s))\n\n📌 **Synthèse Générale :**\n${consensus}`)
            .setFooter({ text: 'Méta-Enquête Multi-Sources • Chienne Bot' })
            .setTimestamp();

        if (timeline && timeline.length > 0) {
            const timelineText = timeline.map(t => `📅 \`${t.date}\` — [${t.title.slice(0, 75)}](${t.url || 'https://discord.com'}) *(${t.source})*`).slice(0, 6).join('\n');
            embed.addFields({
                name: '⏳ Frise Chronologique des Faits',
                value: timelineText.slice(0, 1024),
                inline: false
            });
        }

        if (discrepancies && discrepancies !== 'N/A') {
            embed.addFields({
                name: '⚡ Divergences & Éléments Discutés',
                value: discrepancies.slice(0, 1024),
                inline: false
            });
        }

        return embed;
    }
}

const autofeedsInvestigationService = new AutofeedsInvestigationService();
Injectable()(AutofeedsInvestigationService);

module.exports = {
    AutofeedsInvestigationService,
    autofeedsInvestigationService
};
