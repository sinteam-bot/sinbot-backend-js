/**
 * src/modules/util_autofeeds/services/autofeeds-prediction.service.js
 *
 * Paris & Prédictions Communautaires en XP (Prediction Markets).
 * Permet aux membres de parier leurs points XP sur des événements ou spéculations,
 * puis redistribue équitablement le pool total de gains aux gagnants.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');
const { autofeedsRepository } = require('./autofeeds.repository.js');

class AutofeedsPredictionService {
    constructor(repository = autofeedsRepository, xpService = null) {
        this.repository = repository;
        this.xpService = xpService;
    }

    /**
     * Crée un nouveau marché de prédiction.
     * @param {Object} params
     */
    async createMarket({ guildId, channelId = null, title, description = null, options = ['OUI', 'NON'], sourceUrl = null, closesAt = null, createdBy = null }) {
        if (!guildId || !title) throw new Error('guildId et title obligatoires.');

        const safeOptions = Array.isArray(options) && options.length >= 2 ? options : ['OUI', 'NON'];
        const prediction = await this.repository.createPrediction({
            guildId,
            channelId,
            title,
            description,
            options: safeOptions,
            sourceUrl,
            closesAt,
            createdBy
        });

        return prediction;
    }

    /**
     * Enregistre une mise d'un utilisateur sur une option.
     * @param {Object} params
     */
    async placeBet({ predictionId, userId, optionIndex, amountXp = 10, guildId = 'dm' }) {
        const betAmount = parseInt(amountXp, 10);
        if (isNaN(betAmount) || betAmount <= 0) {
            throw new Error('Le montant de la mise doit être un nombre positif supérieur à 0.');
        }

        const prediction = await this.repository.getPredictionById(predictionId);
        if (!prediction) throw new Error('Prédiction introuvable.');
        if (prediction.status !== 'open') throw new Error('Ce marché de prédiction est déjà fermé.');

        const optIdx = parseInt(optionIndex, 10);
        if (optIdx < 0 || optIdx >= (prediction.options?.length || 2)) {
            throw new Error('Option de prédiction invalide.');
        }

        // Si le service XP est disponible, on vérifie et déduit la mise
        if (this.xpService && typeof this.xpService.deductXp === 'function') {
            try {
                await this.xpService.deductXp(guildId, userId, betAmount, 'autofeed_prediction_bet');
            } catch (err) {
                logger.warn(`[AutofeedsPrediction] Impossible de déduire l'XP de ${userId}: ${err.message}`, 'AUTOFEEDS_PRED');
                throw new Error(`Solde d'XP insuffisant pour parier ${betAmount} XP.`);
            }
        }

        const bet = await this.repository.placePredictionBet({
            predictionId,
            userId,
            guildId,
            optionIndex: optIdx,
            amountXp: betAmount
        });

        return bet;
    }

    /**
     * Résout un marché de prédiction et redistribue proportionnellement le pool total aux gagnants.
     * @param {Object} params
     */
    async resolveMarket({ predictionId, winningOptionIndex, resolvedBy = null }) {
        const winIdx = parseInt(winningOptionIndex, 10);
        const resolved = await this.repository.resolvePrediction(predictionId, winIdx, resolvedBy);
        if (!resolved) throw new Error('Marché de prédiction introuvable ou déjà résolu.');

        const bets = await this.repository.listPredictionBets(predictionId);
        const totalPool = resolved.totalPoolXp || 0;
        const winningBets = bets.filter(b => b.optionIndex === winIdx);
        const winningPool = winningBets.reduce((acc, b) => acc + b.amountXp, 0);

        const payouts = [];

        if (winningPool > 0 && totalPool > 0) {
            for (const bet of winningBets) {
                // Gain proportionnel à la mise dans le sous-pool gagnant
                const share = bet.amountXp / winningPool;
                const userPayout = Math.floor(share * totalPool);
                payouts.push({
                    userId: bet.userId,
                    guildId: bet.guildId,
                    betAmount: bet.amountXp,
                    payout: userPayout
                });

                if (userPayout > 0 && this.xpService && typeof this.xpService.addXp === 'function') {
                    try {
                        await this.xpService.addXp(bet.guildId, bet.userId, userPayout, 'autofeed_prediction_win');
                    } catch (err) {
                        logger.warn(`[AutofeedsPrediction] Erreur paiement gain à ${bet.userId}: ${err.message}`, 'AUTOFEEDS_PRED');
                    }
                }
            }
        }

        return {
            prediction: resolved,
            winningOption: resolved.options[winIdx] || `Option #${winIdx}`,
            totalPool,
            winnersCount: winningBets.length,
            payouts
        };
    }

    /**
     * Construit l'embed Discord du marché de prédiction.
     */
    buildPredictionEmbed(prediction) {
        const isOpen = prediction.status === 'open';
        const color = isOpen ? 0x5865F2 : 0x57F287; // Blurple si ouvert, Vert si résolu
        const options = prediction.options || ['OUI', 'NON'];

        const lines = options.map((opt, idx) => {
            const isWinner = prediction.status === 'resolved' && prediction.winningOptionIndex === idx;
            const prefix = isWinner ? '🏆 ' : '';
            return `• **[#${idx + 1}] ${opt}** ${prefix}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`🎲 PRÉDICTION : ${prediction.title.slice(0, 200)}`)
            .setDescription(`${prediction.description || 'Faites vos jeux et misez vos points XP !'}\n\n**Choix possibles :**\n${lines}`)
            .addFields(
                { name: '💰 Cagnotte Totale', value: `\`${prediction.totalPoolXp || 0} XP\``, inline: true },
                { name: '📊 Statut', value: isOpen ? '🟢 Ouvert aux mises' : `🔒 Résolu (${options[prediction.winningOptionIndex] || 'Fermé'})`, inline: true }
            )
            .setFooter({ text: 'Marché de Prédiction XP • Chienne Bot' })
            .setTimestamp();

        if (prediction.sourceUrl) {
            embed.setURL(prediction.sourceUrl);
        }

        return embed;
    }

    /**
     * Construit la barre de boutons Discord pour voter/parier sur le marché.
     */
    buildPredictionActionRow(predictionId, options = ['OUI', 'NON']) {
        const row = new ActionRowBuilder();
        const opts = options.slice(0, 5); // Max 5 boutons par ligne
        opts.forEach((opt, idx) => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`feed_pred_bet:${predictionId}:${idx}`)
                    .setLabel(`Miser sur "${opt.slice(0, 15)}"`)
                    .setStyle(idx === 0 ? ButtonStyle.Success : ButtonStyle.Primary)
            );
        });
        return row;
    }
}

const autofeedsPredictionService = new AutofeedsPredictionService();
Injectable()(AutofeedsPredictionService);

module.exports = {
    AutofeedsPredictionService,
    autofeedsPredictionService
};
