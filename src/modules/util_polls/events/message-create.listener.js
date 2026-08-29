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

        if (customId.startsWith('poll:vote:')) {
            return this._handleVote(interaction, customId);
        }
    }

    async _handleVote(interaction, customId) {
        const [, , pollId, optionIndexStr] = customId.split(':');
        const optionIndex = parseInt(optionIndexStr, 10);
        const state = await featureRegistry.get(interaction.guild.id, 'polls');
        if (!state || !state.enabled) {
            return interaction.reply({ content: '❌ Sondages désactivés', ephemeral: true });
        }

        const r = await this.service.vote(pollId, interaction.user.id, optionIndex);
        if (!r.ok) {
            const msg = {
                not_found: '❌ Sondage introuvable',
                not_active: '❌ Sondage terminé',
                already_voted: 'ℹ️ Tu as déjà voté'
            }[r.reason] || '❌ Action impossible';
            return interaction.reply({ content: msg, ephemeral: true });
        }

        try {
            const p = await this.service.get(pollId);
            const tally = await this.service.tally(pollId);
            const updatedEmbed = await this.service.buildEmbed(p, tally);
            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(err => {
                console.warn('[PollListener] Échec edit message poll:', err.message);
            });
        } catch (err) {
            console.warn('[PollListener] Erreur refresh tally poll:', err.message);
        }

        return interaction.reply({ content: '✅ Vote pris en compte', ephemeral: true });
    }
}

OnEvent('interactionCreate', {
    configKey: 'features.polls',
    priority: 40
})(PollInteractionListener.prototype, 'handle');

module.exports = { PollInteractionListener };
