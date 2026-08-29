/**
 * giveaways/events/message-create.listener.js
 *
 * Listener splité depuis game_engagement/events/interaction-create.listener.js
 * (Phase 9.2 du plan migrate-to-c12).
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { GiveawayService } = require('../services/giveaway.service.js');

class GiveawayInteractionListener {
    static inject = [GiveawayService];

    constructor(service) {
        this.service = service;
    }

    async handle(interaction) {
        if (!interaction.guild) return;
        if (!interaction.isButton()) return;
        const customId = interaction.customId || '';

        if (customId.startsWith('giveaway:enter:')) {
            return this._handleEnter(interaction, customId);
        }
    }

    async _handleEnter(interaction, customId) {
        const id = customId.split(':')[2];
        const state = await featureRegistry.get(interaction.guild.id, 'giveaways');
        if (!state || !state.enabled) {
            return interaction.reply({ content: '❌ Giveaways désactivés', ephemeral: true });
        }

        const r = await this.service.enter(id, interaction.user.id);
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

        try {
            const g = await this.service.get(id);
            const count = await this.service.countEntries(id);
            const updatedEmbed = await this.service.buildUpdatedEmbed(g, count);
            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(err => {
                console.warn('[GiveawayListener] Échec edit message giveaway:', err.message);
            });
        } catch (err) {
            console.warn('[GiveawayListener] Erreur refresh compteur giveaway:', err.message);
        }

        return interaction.reply({ content: '🎉 Tu participes au giveaway !', ephemeral: true });
    }
}

OnEvent('interactionCreate', {
    configKey: 'features.giveaways',
    priority: 40
})(GiveawayInteractionListener.prototype, 'handle');

module.exports = { GiveawayInteractionListener };
