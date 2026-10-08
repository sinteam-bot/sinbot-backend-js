/**
 * src/modules/util_autofeeds/services/autofeeds-trivia.service.js
 *
 * Le "Quiz d'Actu du Dimanche Soir" (Weekly News Trivia & XP).
 * Génère des questions à choix multiples (QCM) basées sur les faits réels parus
 * dans la semaine, gère les réponses interactives des membres et distribue de l'XP.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { callChatGPT } = require('../../../utils/openrouter.js');
const logger = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');
const { autofeedsRepository } = require('./autofeeds.repository.js');

class AutofeedsTriviaService {
    constructor(repository = autofeedsRepository, callAiFn = callChatGPT, xpService = null) {
        this.repository = repository;
        this.callAi = callAiFn;
        this.xpService = xpService;
    }

    /**
     * Génère un nouveau quiz QCM d'actualité pour une guilde.
     * @param {Object} params
     * @param {string} params.guildId
     * @param {string} [params.channelId]
     * @param {number} [params.xpReward]
     * @returns {Promise<Object>} Quiz créé
     */
    async generateWeeklyQuiz({ guildId, channelId = null, xpReward = 50 }) {
        if (!guildId) throw new Error('guildId obligatoire pour générer un quiz.');

        // Récupérer les articles récents du serveur
        const recentArticles = await this.repository.listRecentHistory(guildId, 10);
        if (!recentArticles || recentArticles.length === 0) {
            throw new Error('Pas assez d\'articles dans l\'historique du serveur pour créer un quiz.');
        }

        const randomArticle = recentArticles[Math.floor(Math.random() * recentArticles.length)];
        const prompt = `Voici une actualité récente :
Titre: ${randomArticle.title}
Contenu: ${(randomArticle.itemContent || randomArticle.summary || '').slice(0, 1000)}

Crée une question de quiz captivante avec 4 options de réponse (une seule correcte).
Réponds STRICTEMENT sous ce format JSON valide :
{
  "question": "Texte de la question ?",
  "options": ["Choix A", "Choix B", "Choix C", "Choix D"],
  "correctIndex": 0,
  "explanation": "Explication brève confirmant pourquoi cette réponse est la bonne."
}`;

        let parsed = null;
        try {
            const res = await this.callAi(prompt, {
                systemPrompt: "Tu es le maître du jeu d'un quiz d'actualités Discord. Pose des questions divertissantes et précises sur les faits récents.",
                maxTokens: 400,
                temperature: 0.3,
                allowFallback: true
            });

            const raw = typeof res === 'string' ? res : (res?.result || '');
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch (err) {
            logger.warn(`[AutofeedsTrivia] Échec appel IA quiz: ${err.message}`, 'AUTOFEEDS_TRIVIA');
        }

        if (!parsed || !Array.isArray(parsed.options) || parsed.options.length !== 4) {
            // Quiz déterministe de secours
            parsed = {
                question: `Quel sujet ou annonce concerne l'actualité récente : "${randomArticle.title.slice(0, 80)}" ?`,
                options: [
                    randomArticle.title.slice(0, 60),
                    'Une sortie repoussée à 2028',
                    'Une mise à jour annulée',
                    'Un partenariat inattendu'
                ],
                correctIndex: 0,
                explanation: `L'actualité traitait précisément de "${randomArticle.title}".`
            };
        }

        const quiz = await this.repository.createTriviaQuiz({
            guildId,
            channelId,
            question: parsed.question,
            options: parsed.options,
            correctIndex: parsed.correctIndex ?? 0,
            explanation: parsed.explanation || 'Explication confirmée par l\'article de presse.',
            sourceUrl: randomArticle.link || null,
            xpReward: parseInt(xpReward, 10) || 50
        });

        return quiz;
    }

    /**
     * Construit l'embed de présentation du Quiz Discord.
     */
    buildQuizEmbed(quiz) {
        const letters = ['🅰️', '🅱️', '🅲', '🅳'];
        const optionsList = (quiz.options || []).map((opt, idx) => `${letters[idx]} **${opt}**`).join('\n\n');

        return new EmbedBuilder()
            .setColor(0xEB459E) // Rose fuchsia festif Trivia
            .setTitle(`🧠 QUIZ D'ACTU DE LA SEMAINE`)
            .setDescription(`**${quiz.question}**\n\n${optionsList}`)
            .addFields(
                { name: '🎁 Récompense', value: `\`+${quiz.xpReward || 50} XP\` pour chaque bonne réponse !`, inline: true },
                { name: '⏱️ Participation', value: 'Cliquez sur l\'une des lettres ci-dessous.', inline: true }
            )
            .setFooter({ text: 'Quiz d\'Actu Hebdo • Chienne Bot' })
            .setTimestamp();
    }

    /**
     * Construit la rangée de boutons Discord (A, B, C, D) pour répondre.
     */
    buildQuizActionRow(quizId) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`feed_trivia_ans:${quizId}:0`).setLabel('A').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`feed_trivia_ans:${quizId}:1`).setLabel('B').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`feed_trivia_ans:${quizId}:2`).setLabel('C').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`feed_trivia_ans:${quizId}:3`).setLabel('D').setStyle(ButtonStyle.Primary)
        );
    }

    /**
     * Traite la réponse d'un utilisateur au quiz.
     */
    async handleAnswerInteraction(interaction, quizId, selectedIndex) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId || 'dm';

        const quiz = await this.repository.getTriviaQuizById(quizId);
        if (!quiz) {
            await interaction.reply({ content: '❌ Ce quiz est introuvable ou a expiré.', ephemeral: true }).catch(() => {});
            return { ok: false, error: 'Quiz non trouvé' };
        }

        const already = await this.repository.hasUserAnsweredTrivia(quizId, userId);
        if (already) {
            await interaction.reply({ content: '⚠️ Vous avez déjà soumis votre réponse pour ce quiz !', ephemeral: true }).catch(() => {});
            return { ok: false, alreadyAnswered: true };
        }

        const isCorrect = parseInt(selectedIndex, 10) === quiz.correctIndex;
        const xpEarned = isCorrect ? (quiz.xpReward || 50) : 0;

        await this.repository.recordTriviaAnswer({
            quizId,
            userId,
            guildId,
            selectedIndex: parseInt(selectedIndex, 10),
            isCorrect,
            xpEarned
        });

        if (isCorrect && xpEarned > 0 && this.xpService && typeof this.xpService.addXp === 'function') {
            try {
                await this.xpService.addXp(guildId, userId, xpEarned, 'autofeed_trivia');
            } catch (err) {
                logger.warn(`[AutofeedsTrivia] Échec ajout XP: ${err.message}`, 'AUTOFEEDS_TRIVIA');
            }
        }

        const letters = ['A', 'B', 'C', 'D'];
        const chosenLetter = letters[selectedIndex] || '?';
        const correctLetter = letters[quiz.correctIndex] || 'A';

        if (isCorrect) {
            await interaction.reply({
                content: `🎉 **BONNE RÉPONSE !** (Option **${chosenLetter}**)\nVous remportez **+${xpEarned} XP** !\n\n📖 *${quiz.explanation}*`,
                ephemeral: true
            }).catch(() => {});
        } else {
            await interaction.reply({
                content: `❌ **Mauvaise réponse...** Vous aviez choisi **${chosenLetter}**.\nLa bonne réponse était la **${correctLetter}** : *${quiz.options[quiz.correctIndex]}*.\n\n📖 *${quiz.explanation}*`,
                ephemeral: true
            }).catch(() => {});
        }

        return { ok: true, isCorrect, xpEarned };
    }
}

const autofeedsTriviaService = new AutofeedsTriviaService();
Injectable()(AutofeedsTriviaService);

module.exports = {
    AutofeedsTriviaService,
    autofeedsTriviaService
};
