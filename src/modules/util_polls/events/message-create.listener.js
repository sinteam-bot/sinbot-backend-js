/**
 * polls/events/message-create.listener.js
 *
 * Listener splité depuis game_engagement/events/interaction-create.listener.js
 * (Phase 9.2 du plan migrate-to-c12).
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { PollService } = require('../services/poll.service.js');

class PollInteractionListener {
    static inject = [PollService];

    constructor(service) {
        this.service = service;
    }

    async handle(interaction) {
        if (!interaction.guild) return;
        if (!interaction.isButton()) return;
        const customId = interaction.customId || '';

        if (customId.startsWith('handlepollvote(interaction, customid) {:')) {
            return this.__handlePollVote(interaction, customId);
        }
    }

        const [, , pollId, optionIndexStr] = customId.split(':');
        const optionIndex = parseInt(optionIndexStr, 10);
        const state = await featureRegistry.get(interaction.guild.id, 'engagement');
        if (!state.enabled) {
            return interaction.reply({ content: '❌ Sondages désactivés', ephemeral: true });
        }

        const r = await this.poll.vote(pollId, interaction.user.id, optionIndex);
        if (!r.ok) {
            const msg = {
                not_found: '❌ Sondage introuvable',
                not_active: '❌ Sondage terminé',
                ended: '❌ Sondage expiré',
                invalid_option: '❌ Option invalide'
            }[r.reason] || '❌ Vote impossible';
            return interaction.reply({ content: msg, ephemeral: true });
        }

        // Régénère l'embed avec les nouveaux résultats
        try {
            const p = await this.poll.get(pollId);
            const showResults = state.config?.polls?.show_results_after_vote !== false;
            const embed = await this.poll.buildEmbed(p, { showResults, voter: interaction.user.id });
            await interaction.message.edit({ embeds: [embed] }).catch(err => {
                console.warn('[EngagementListener] Échec edit message sondage:', err.message);
            });
        } catch (err) {
            console.warn('[EngagementListener] Erreur refresh sondage:', err.message);
        }

        return interaction.reply({ content: '✅ Vote enregistré', ephemeral: true });
    }
}

OnEvent('interactionCreate', {
    configKey: 'features.polls',
    priority: 40
})(PollInteractionListener.prototype, 'handle');

module.exports = { PollInteractionListener };
