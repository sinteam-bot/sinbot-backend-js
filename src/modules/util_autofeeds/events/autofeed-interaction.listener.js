/**
 * src/modules/util_autofeeds/events/autofeed-interaction.listener.js
 *
 * Listener d'interaction pour les boutons de souscription rapide sous les flux Discord.
 */

const { OnEvent } = require('../../../core/index.js');
const { AutofeedsSubscriptionService } = require('../services/autofeeds-subscription.service.js');
const { AutofeedsService } = require('../services/autofeeds.service.js');
const logger = require('../../../utils/logger.js');

class AutofeedInteractionListener {
    static inject = [AutofeedsSubscriptionService, AutofeedsService];

    constructor(subService, feedService) {
        this.subService = subService;
        this.feedService = feedService;
    }

    async handle(interaction) {
        // Cas 0 : Menu déroulant interactif de sélection d'abonnements
        if (interaction.isStringSelectMenu?.()) {
            const customId = interaction.customId || '';
            if (customId === 'autofeed:select_menu') {
                const selectedFeedIds = interaction.values || [];
                const guildId = interaction.guildId || 'default';
                const userId = interaction.user.id;

                try {
                    let addedCount = 0;
                    for (const feedId of selectedFeedIds) {
                        const feed = await this.feedService.getFeed(feedId);
                        if (feed) {
                            await this.subService.subscribe({
                                guildId,
                                userId,
                                targetType: 'feed',
                                targetValue: feedId,
                                notifyMode: 'mention'
                            });

                            if (feed.subscriberRoleId && interaction.member?.roles?.add) {
                                try {
                                    await interaction.member.roles.add(feed.subscriberRoleId);
                                } catch (roleErr) {
                                    logger.warn(`[AutofeedInteraction] Impossible d'attribuer le rôle ${feed.subscriberRoleId}: ${roleErr.message}`, 'AUTOFEEDS');
                                }
                            }
                            addedCount++;
                        }
                    }

                    if (addedCount === 0) {
                        return interaction.reply({
                            content: 'ℹ️ Aucun flux valide sélectionné ou flux introuvables.',
                            ephemeral: true
                        });
                    }

                    return interaction.reply({
                        content: `✅ Vous êtes désormais abonné à **${addedCount}** flux !\nVous recevrez des alertes lors des nouvelles publications.`,
                        ephemeral: true
                    });
                } catch (err) {
                    logger.warn(`[AutofeedInteraction] Erreur menu select: ${err.message}`, 'AUTOFEEDS');
                    return interaction.reply({ content: '❌ Erreur lors de l\'enregistrement de vos abonnements.', ephemeral: true });
                }
            }
            return;
        }

        if (!interaction.isButton()) return;
        const customId = interaction.customId || '';

        // Cas 1 : Bouton de souscription rapide à un tag (autofeed:sub:tag:<tagName>)
        if (customId.startsWith('autofeed:sub:tag:')) {
            const tag = customId.replace('autofeed:sub:tag:', '').trim().toLowerCase();
            const guildId = interaction.guildId || 'default';
            const userId = interaction.user.id;

            try {
                await this.subService.subscribe({
                    guildId,
                    userId,
                    targetType: 'tag',
                    targetValue: tag,
                    notifyMode: 'mention'
                });

                return interaction.reply({
                    content: `🔔 Vous êtes maintenant abonné au tag **#${tag}** !\nVous serez notifié lors de la publication de nouvelles offres ou articles portant ce tag.`,
                    ephemeral: true
                });
            } catch (err) {
                logger.warn(`[AutofeedInteraction] Erreur souscription tag: ${err.message}`, 'AUTOFEEDS');
                return interaction.reply({ content: '❌ Erreur lors de la souscription.', ephemeral: true });
            }
        }

        // Cas 1b : Bouton de souscription rapide à un créateur/compte (autofeed:sub:author:<name>)
        if (customId.startsWith('autofeed:sub:author:')) {
            const author = customId.replace('autofeed:sub:author:', '').trim().toLowerCase();
            const guildId = interaction.guildId || 'default';
            const userId = interaction.user.id;

            try {
                await this.subService.subscribe({
                    guildId,
                    userId,
                    targetType: 'account',
                    targetValue: author,
                    notifyMode: 'mention'
                });

                return interaction.reply({
                    content: `👤 Vous êtes maintenant abonné aux publications de **@${author}** !\nVous serez alerté dès qu'un contenu de ce créateur ou compte est publié.`,
                    ephemeral: true
                });
            } catch (err) {
                logger.warn(`[AutofeedInteraction] Erreur souscription auteur: ${err.message}`, 'AUTOFEEDS');
                return interaction.reply({ content: '❌ Erreur lors de la souscription.', ephemeral: true });
            }
        }

        // Cas 2 : Bouton de désinscription (autofeed:unsub:<id>)
        if (customId.startsWith('autofeed:unsub:')) {
            const subId = customId.replace('autofeed:unsub:', '').trim();
            try {
                await this.subService.unsubscribeById(subId);
                return interaction.reply({
                    content: '✅ Souscription supprimée avec succès.',
                    ephemeral: true
                });
            } catch (err) {
                return interaction.reply({ content: '❌ Erreur lors de la désinscription.', ephemeral: true });
            }
        }

        // Cas 3 : Bouton d'installation rapide d'un preset (autofeed:install:<presetId>)
        if (customId.startsWith('autofeed:install:')) {
            if (!interaction.memberPermissions?.has('ManageGuild') && !interaction.memberPermissions?.has('Administrator')) {
                return interaction.reply({ content: '❌ Permission requise : Gérer le serveur.', ephemeral: true });
            }

            const presetId = customId.replace('autofeed:install:', '').trim();
            const guildId = interaction.guildId;
            const channelId = interaction.channelId;

            try {
                const res = await this.feedService.installPreset(guildId, channelId, presetId);
                if (res.ok) {
                    return interaction.reply({
                        content: `✅ Preset **${res.data.name || presetId}** installé avec succès dans ce salon !`,
                        ephemeral: true
                    });
                } else {
                    return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
                }
            } catch (err) {
                return interaction.reply({ content: `❌ Erreur: ${err.message}`, ephemeral: true });
            }
        }
    }
}

OnEvent('interactionCreate')(AutofeedInteractionListener.prototype, 'handle');

module.exports = { AutofeedInteractionListener };
