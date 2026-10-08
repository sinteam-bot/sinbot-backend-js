/**
 * src/modules/util_autofeeds/services/autofeeds-gamification.service.js
 *
 * Service de gamification "Drop Hunter" : réclamations d'offres (LootScraper, Freebies),
 * attribution d'XP et mise à jour dynamique des boutons interactifs de claim.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class AutofeedsGamificationService {
    constructor(repository, xpService = null) {
        this.repository = repository;
        this.xpService = xpService;
    }

    /**
     * Crée le bouton Discord Drop Hunter avec le compteur de réclamations.
     * @param {string} feedId
     * @param {string} itemId
     * @param {number} count
     * @param {string} [customLabel]
     */
    createClaimButton(feedId, itemId, count = 0, customLabel = null) {
        const label = customLabel || (count > 0 ? `🎁 J'ai récupéré l'offre ! (${count})` : `🎁 J'ai récupéré l'offre !`);
        return new ButtonBuilder()
            .setCustomId(`autofeed:claim:${feedId}:${encodeURIComponent(itemId)}`)
            .setLabel(label)
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎁');
    }

    /**
     * Traite un clic de réclamation Drop Hunter.
     * @param {import('discord.js').ButtonInteraction} interaction
     * @param {string} feedId
     * @param {string} itemId
     */
    async handleClaimInteraction(interaction, feedId, itemId) {
        const guildId = interaction.guildId || 'dm';
        const userId = interaction.user.id;

        // Récupérer le flux pour connaître le montant d'XP
        const feed = await this.repository.getFeedById(feedId);
        const xpAmount = feed ? (feed.gamificationXpReward || 25) : 25;

        const result = await this.repository.claimItem({
            feedId,
            itemId,
            userId,
            guildId,
            xpAwarded: xpAmount
        });

        if (result.alreadyClaimed) {
            await interaction.reply({
                content: `ℹ️ Vous avez déjà récupéré cette offre ! (${result.claimsCount} membre(s) l'ont réclamée)`,
                ephemeral: true
            }).catch(() => {});
            return result;
        }

        // Tenter d'attribuer l'XP au membre via le service XP s'il est injecté
        if (this.xpService && typeof this.xpService.addXp === 'function') {
            try {
                await this.xpService.addXp(guildId, userId, xpAmount, 'autofeed_drop');
            } catch (err) {
                // Pas bloquant si le module XP est désactivé sur cette guilde
            }
        }

        // Répondre avec confirmation éphémère
        await interaction.reply({
            content: `🎉 **Félicitations !** Vous avez réclamé cette offre et remporté **+${xpAmount} XP** !\n👥 **${result.claimsCount}** membre(s) en ont profité sur le serveur.`,
            ephemeral: true
        }).catch(() => {});

        // Mise à jour in-place du bouton sur le message avec le nouveau compteur
        try {
            if (interaction.message && interaction.message.components) {
                const updatedComponents = interaction.message.components.map(row => {
                    const newRow = new ActionRowBuilder();
                    for (const comp of row.components) {
                        if (comp.customId && comp.customId.startsWith(`autofeed:claim:${feedId}:`)) {
                            const newBtn = ButtonBuilder.from(comp)
                                .setLabel(`🎁 J'ai récupéré l'offre ! (${result.claimsCount})`);
                            newRow.addComponents(newBtn);
                        } else {
                            newRow.addComponents(ButtonBuilder.from(comp));
                        }
                    }
                    return newRow;
                });

                await interaction.message.edit({ components: updatedComponents }).catch(() => {});
            }
        } catch {
            // Silencieux si échec d'édition in-place
        }

        return result;
    }
}

module.exports = { AutofeedsGamificationService };
