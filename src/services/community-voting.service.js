/**
 * community-voting.service.js
 * 
 * Moteur de Vote Universel & Réutilisable pour Discord (Upvote / Downvote).
 * Conçu pour être utilisé par util_autofeeds (curation Best-Of / Hall of Fame)
 * ainsi que par de futurs modules (suggestions, confessions, daily-message, showcase, etc.).
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../utils/logger');

class CommunityVotingService {
    constructor() {
        /**
         * Stockage mémoire des votes :
         * key: `${targetType}:${targetId}` => Map<userId, { direction: 1 | -1, updatedAt: Date }>
         */
        this.votes = new Map();

        /**
         * Hooks enregistrés par targetType :
         * key: targetType => Array<Function({ guildId, targetType, targetId, stats, interaction, message })>
         */
        this.thresholdHooks = new Map();
    }

    /**
     * Génère la clé unique pour une cible de vote.
     */
    _getStorageKey(targetType, targetId) {
        return `${String(targetType).trim().toLowerCase()}:${String(targetId).trim()}`;
    }

    /**
     * Enregistre ou bascule (toggle) le vote d'un utilisateur.
     * @param {Object} params
     * @param {string} params.guildId
     * @param {string} params.targetType ex: 'autofeed', 'suggestion', 'confession'
     * @param {string} params.targetId ex: id de l'article ou du message
     * @param {string} params.userId
     * @param {'up'|'down'|1|-1} params.direction
     * @param {Object} [params.context] données supplémentaires
     * @returns {Object} résultat du vote avec stats actualisées
     */
    vote({ guildId = 'default', targetType, targetId, userId, direction, voteType, context = {} }) {
        if (!targetType || !targetId || !userId) {
            throw new Error('Paramètres manquants: targetType, targetId et userId sont obligatoires');
        }

        const effectiveDir = direction || voteType;
        const key = this._getStorageKey(targetType, targetId);
        if (!this.votes.has(key)) {
            this.votes.set(key, new Map());
        }

        const targetVotes = this.votes.get(key);
        const numericDirection = effectiveDir === 'up' || effectiveDir === 1 ? 1 : -1;
        const existingVote = targetVotes.get(userId);

        let action = 'added';
        let currentVote = numericDirection;

        if (existingVote) {
            if (existingVote.direction === numericDirection) {
                // Même vote cliqué à nouveau => toggle / annulation
                targetVotes.delete(userId);
                action = 'removed';
                currentVote = 0;
            } else {
                // Vote opposé => bascule
                targetVotes.set(userId, { direction: numericDirection, updatedAt: new Date(), guildId });
                action = 'switched';
                currentVote = numericDirection;
            }
        } else {
            targetVotes.set(userId, { direction: numericDirection, updatedAt: new Date(), guildId });
            action = 'added';
            currentVote = numericDirection;
        }

        const stats = this.getStats(targetType, targetId);

        // Déclenchement des hooks de seuil
        this._triggerThresholdHooks({
            guildId,
            targetType,
            targetId,
            stats,
            action,
            currentVote,
            userId,
            context
        });

        return {
            success: true,
            action,
            currentVote,
            userVote: currentVote === 1 ? 'up' : (currentVote === -1 ? 'down' : null),
            stats
        };
    }

    /**
     * Calcule les statistiques de vote pour une cible donnée.
     * @param {string} targetType
     * @param {string} targetId
     * @returns {{ upvotes: number, downvotes: number, score: number, votersCount: number }}
     */
    getStats(targetType, targetId) {
        const key = this._getStorageKey(targetType, targetId);
        const targetVotes = this.votes.get(key);

        if (!targetVotes || targetVotes.size === 0) {
            return { upvotes: 0, downvotes: 0, score: 0, votersCount: 0, totalVotes: 0 };
        }

        let upvotes = 0;
        let downvotes = 0;

        for (const entry of targetVotes.values()) {
            if (entry.direction === 1) upvotes++;
            else if (entry.direction === -1) downvotes++;
        }

        return {
            upvotes,
            downvotes,
            score: upvotes - downvotes,
            votersCount: targetVotes.size,
            totalVotes: targetVotes.size
        };
    }

    /**
     * Récupère le vote actuel d'un utilisateur spécifique (1, -1 ou 0).
     */
    getUserVote(targetType, targetId, userId) {
        const key = this._getStorageKey(targetType, targetId);
        const targetVotes = this.votes.get(key);
        if (!targetVotes || !targetVotes.has(userId)) return 0;
        return targetVotes.get(userId).direction;
    }

    /**
     * Construit une ligne d'action Discord (ActionRowBuilder) avec les boutons de vote.
     * @param {Object} options
     * @param {string} options.targetType
     * @param {string} options.targetId
     * @param {number} [options.upvotes]
     * @param {number} [options.downvotes]
     * @param {number} [options.upCount]
     * @param {number} [options.downCount]
     * @param {number|string} [options.userVote]
     * @param {boolean} [options.disabled]
     * @returns {ActionRowBuilder}
     */
    buildVoteRow({ targetType, targetId, upvotes, downvotes, upCount, downCount, userVote = 0, disabled = false }) {
        const effectiveUp = upCount !== undefined ? upCount : upvotes;
        const effectiveDown = downCount !== undefined ? downCount : downvotes;

        const currentStats = (effectiveUp !== undefined && effectiveDown !== undefined)
            ? { upvotes: effectiveUp, downvotes: effectiveDown }
            : this.getStats(targetType, targetId);

        const isUserUp = userVote === 1 || userVote === 'up';
        const isUserDown = userVote === -1 || userVote === 'down';

        const upButton = new ButtonBuilder()
            .setCustomId(`vote:${targetType}:${targetId}:up`)
            .setLabel(`👍 ${currentStats.upvotes}`)
            .setStyle(isUserUp ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled);

        const downButton = new ButtonBuilder()
            .setCustomId(`vote:${targetType}:${targetId}:down`)
            .setLabel(`👎 ${currentStats.downvotes}`)
            .setStyle(isUserDown ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setDisabled(disabled);

        return new ActionRowBuilder().addComponents(upButton, downButton);
    }

    /**
     * Enregistre un hook appelé lors d'un vote sur un targetType.
     * @param {string} targetType
     * @param {Function} callback ({ guildId, targetType, targetId, stats, action, currentVote, userId, context })
     */
    registerThresholdHook(targetType, callback) {
        const normalized = String(targetType).trim().toLowerCase();
        if (!this.thresholdHooks.has(normalized)) {
            this.thresholdHooks.set(normalized, []);
        }
        this.thresholdHooks.get(normalized).push(callback);
    }

    /**
     * Déclenche les hooks enregistrés pour un targetType.
     * @private
     */
    async _triggerThresholdHooks(payload) {
        const normalized = String(payload.targetType).trim().toLowerCase();
        const hooks = this.thresholdHooks.get(normalized);
        if (!hooks || hooks.length === 0) return;

        for (const hook of hooks) {
            try {
                await hook(payload);
            } catch (err) {
                logger.error(`[CommunityVoting] Erreur dans threshold hook (${normalized}): ${err.message}`, 'VOTING');
            }
        }
    }

    /**
     * Gère directement une interaction de bouton Discord commençant par 'vote:'.
     * @param {import('discord.js').ButtonInteraction} interaction
     */
    async handleInteraction(interaction) {
        if ((typeof interaction.isButton === 'function' && !interaction.isButton()) || !interaction.customId?.startsWith('vote:')) {
            return false;
        }

        const parts = interaction.customId.split(':');
        if (parts.length < 4) {
            return false;
        }

        const [, targetType, targetId, rawDirection] = parts;
        const guildId = interaction.guildId || 'default';
        const userId = interaction.user.id;
        const direction = rawDirection === 'up' ? 'up' : 'down';

        try {
            const result = this.vote({
                guildId,
                targetType,
                targetId,
                userId,
                direction,
                context: {
                    channelId: interaction.channelId,
                    messageId: interaction.message?.id,
                    interaction
                }
            });

            // Met à jour les boutons du message d'origine
            if (interaction.message && interaction.message.editable) {
                try {
                    const newRow = this.buildVoteRow({
                        targetType,
                        targetId,
                        upvotes: result.stats.upvotes,
                        downvotes: result.stats.downvotes,
                        userVote: result.currentVote
                    });

                    // Conserver les autres rows du message s'il y en a
                    const existingRows = (interaction.message.components || []).map(row => {
                        const hasVoteButton = row.components.some(c => c.customId?.startsWith(`vote:${targetType}:${targetId}:`));
                        return hasVoteButton ? newRow : row;
                    });

                    await interaction.message.edit({ components: existingRows });
                } catch (editErr) {
                    logger.debug(`[CommunityVoting] Impossible de mettre à jour le message: ${editErr.message}`, 'VOTING');
                }
            }

            // Réponse éphémère à l'utilisateur
            let feedback = '';
            if (result.action === 'added') {
                feedback = `✅ Votre vote ${direction === 'up' ? '👍 **Positif**' : '👎 **Négatif**'} a été enregistré ! (Score : **${result.stats.score}**)`;
            } else if (result.action === 'removed') {
                feedback = `↩️ Votre vote a été retiré. (Score : **${result.stats.score}**)`;
            } else if (result.action === 'switched') {
                feedback = `🔄 Votre vote a été basculé en ${direction === 'up' ? '👍 **Positif**' : '👎 **Négatif**'}. (Score : **${result.stats.score}**)`;
            }

            if (typeof interaction.reply === 'function' && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: feedback, ephemeral: true });
            } else if (typeof interaction.update === 'function' && !interaction.replied && !interaction.deferred) {
                const newRow = this.buildVoteRow({
                    targetType,
                    targetId,
                    upvotes: result.stats.upvotes,
                    downvotes: result.stats.downvotes,
                    userVote: result.currentVote
                });
                await interaction.update({ components: [newRow] });
            }
            return true;
        } catch (err) {
            logger.error(`[CommunityVoting] Erreur vote interaction: ${err.message}`, 'VOTING');
            if (typeof interaction.reply === 'function' && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `❌ Erreur lors du vote: ${err.message}`, ephemeral: true });
            }
            return true;
        }
    }
}

const communityVotingService = new CommunityVotingService();

module.exports = {
    CommunityVotingService,
    communityVotingService
};
