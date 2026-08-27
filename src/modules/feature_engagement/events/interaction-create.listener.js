/**
 * EngagementInteractionListener
 * - Boutons: giveaway:enter:<id>, poll:vote:<pollId>:<optionIndex>
 *
 * Toute la logique Discord.js (édition d'embed, envoi de DM) est ici.
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { GiveawayService } = require('../services/giveaway.service.js');
const { PollService } = require('../services/poll.service.js');

class EngagementInteractionListener {
    static inject = [GiveawayService, PollService];

    constructor(giveaway, poll) {
        this.giveaway = giveaway;
        this.poll = poll;
    }

    async handle(interaction) {
        if (!interaction.guild) return;
        if (!interaction.isButton()) return;
        const customId = interaction.customId || '';

        if (customId.startsWith('giveaway:enter:')) {
            return this._handleGiveawayEnter(interaction, customId);
        }
        if (customId.startsWith('poll:vote:')) {
            return this._handlePollVote(interaction, customId);
        }
    }

    async _handleGiveawayEnter(interaction, customId) {
        const id = customId.split(':')[2];
        const state = await featureRegistry.get(interaction.guild.id, 'engagement');
        if (!state.enabled) {
            return interaction.reply({ content: '❌ Giveaways désactivés', ephemeral: true });
        }

        const r = await this.giveaway.enter(id, interaction.user.id);
        if (!r.ok) {
            const msg = {
                not_found: '❌ Giveaway introuvable',
                not_active: '❌ Giveaway terminé',
                ended: '❌ Giveaway expiré',
                role_required: '❌ Tu n\'as pas le rôle requis',
                already_entered: 'ℹ️ Tu participes déjà !'
            }[r.reason] || '❌ Action impossible';
            return interaction.reply({ content: msg, ephemeral: true });
        }

        // Met à jour le compteur dans l'embed
        try {
            const g = await this.giveaway.get(id);
            const count = await this.giveaway.countEntries(id);
            const updatedEmbed = await this.giveaway.buildUpdatedEmbed(g, count);
            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
        } catch {}

        return interaction.reply({ content: '🎉 Tu participes au giveaway !', ephemeral: true });
    }

    async _handlePollVote(interaction, customId) {
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
            await interaction.message.edit({ embeds: [embed] }).catch(() => {});
        } catch {}

        return interaction.reply({ content: '✅ Vote enregistré', ephemeral: true });
    }
}

OnEvent('interactionCreate', {
    configKey: 'features.engagement',
    priority: 40
})(EngagementInteractionListener.prototype, 'handle');

module.exports = { EngagementInteractionListener };
