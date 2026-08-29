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

        if (customId.startsWith('handlegiveawayenter(interaction, customid) {:')) {
            return this.__handleGiveawayEnter(interaction, customId);
        }
    }

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
            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(err => {
                console.warn('[EngagementListener] Échec edit message giveaway:', err.message);
            });
        } catch (err) {
            console.warn('[EngagementListener] Erreur refresh compteur giveaway:', err.message);
        }

        return interaction.reply({ content: '🎉 Tu participes au giveaway !', ephemeral: true });
    }
}

OnEvent('interactionCreate', {
    configKey: 'features.giveaways',
    priority: 40
})(GiveawayInteractionListener.prototype, 'handle');

module.exports = { GiveawayInteractionListener };
