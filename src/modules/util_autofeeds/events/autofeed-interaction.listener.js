/**
 * src/modules/util_autofeeds/events/autofeed-interaction.listener.js
 *
 * Listener d'interaction pour les boutons et modales des flux Discord :
 * - Souscriptions rapides aux tags et auteurs
 * - Salle d'attente de modération (Approuver / Rejeter)
 * - Traduction éphémère (feed_trans)
 * - Assistant IA Q&A dédié à l'article (feed_qa)
 * - Résumé de vidéo YouTube (feed_vsum)
 */

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
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

    async _resolveHistoryOrEmbed(target, interaction) {
        let title = '';
        let url = '';
        let content = '';

        if (/^\d+$/.test(target)) {
            const histItem = await this.feedService.repo.getHistoryItemById(Number(target));
            if (histItem) {
                title = histItem.title;
                url = histItem.link;
                content = histItem.itemContent || '';
            }
        }

        if (!url && target.startsWith('http')) {
            url = target;
        }

        if (!title && interaction.message?.embeds?.[0]) {
            const emb = interaction.message.embeds[0];
            title = emb.title || '';
            url = url || emb.url || '';
            content = content || emb.description || '';
        }

        return { title, url, content };
    }

    async handle(interaction) {
        // Modal Submit : Assistant IA Q&A
        if (interaction.isModalSubmit?.()) {
            const customId = interaction.customId || '';
            if (customId.startsWith('feed_qa_modal:')) {
                const target = customId.replace('feed_qa_modal:', '').trim();
                const question = interaction.fields.getTextInputValue('feed_qa_input');

                await interaction.deferReply({ ephemeral: true });

                try {
                    const { title, url, content } = await this._resolveHistoryOrEmbed(target, interaction);
                    const res = await this.feedService.answerArticleQuestion({
                        url,
                        question,
                        articleTitle: title,
                        articleContent: content
                    });

                    return interaction.editReply({
                        content: `💬 **Question :** *${question}*\n\n🤖 **Réponse de l'IA (basée sur l'article) :**\n${res.answer}`
                    });
                } catch (err) {
                    logger.warn(`[AutofeedInteraction] Erreur Q&A modal: ${err.message}`, 'AUTOFEEDS');
                    return interaction.editReply({
                        content: `❌ Impossible d'obtenir la réponse IA : ${err.message}`
                    });
                }
            }
            return;
        }

        // Menu déroulant interactif de sélection d'abonnements
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

        // Bouton de souscription rapide à un tag
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

        // Bouton de souscription rapide à un créateur/compte
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

        // Bouton de désinscription
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

        // Bouton d'installation rapide d'un preset
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

        // Bouton Drop Hunter / Claim de bon plan
        if (customId.startsWith('autofeed:claim:')) {
            const parts = customId.replace('autofeed:claim:', '').split(':');
            const feedId = parts[0];
            const itemId = decodeURIComponent(parts.slice(1).join(':'));

            if (this.feedService?.gamificationService) {
                return this.feedService.gamificationService.handleClaimInteraction(interaction, feedId, itemId);
            }
        }

        // --- NOUVEAUTÉS LOT V6 ---

        // 1. Modération : Validation manuelle (Approuver)
        if (customId.startsWith('feed_mod:approve:')) {
            if (!interaction.memberPermissions?.has('ManageMessages') && !interaction.memberPermissions?.has('ManageGuild') && !interaction.memberPermissions?.has('Administrator')) {
                return interaction.reply({ content: '❌ Permission requise : Gérer les messages ou le serveur.', ephemeral: true });
            }

            const historyId = parseInt(customId.replace('feed_mod:approve:', '').trim(), 10);
            await interaction.deferUpdate();

            try {
                const res = await this.feedService.approvePendingNews(historyId, interaction.user.id, interaction.client);
                return interaction.editReply({
                    content: `✅ **Actualité approuvée** par <@${interaction.user.id}> et publiée dans <#${res.channelId}> !`,
                    components: []
                });
            } catch (err) {
                return interaction.followUp({ content: `❌ Erreur lors de l'approbation : ${err.message}`, ephemeral: true });
            }
        }

        // 2. Modération : Validation manuelle (Rejeter)
        if (customId.startsWith('feed_mod:reject:')) {
            if (!interaction.memberPermissions?.has('ManageMessages') && !interaction.memberPermissions?.has('ManageGuild') && !interaction.memberPermissions?.has('Administrator')) {
                return interaction.reply({ content: '❌ Permission requise : Gérer les messages ou le serveur.', ephemeral: true });
            }

            const historyId = parseInt(customId.replace('feed_mod:reject:', '').trim(), 10);
            await interaction.deferUpdate();

            try {
                await this.feedService.rejectPendingNews(historyId, interaction.user.id);
                return interaction.editReply({
                    content: `❌ **Actualité rejetée** par <@${interaction.user.id}>. Non publiée.`,
                    components: []
                });
            } catch (err) {
                return interaction.followUp({ content: `❌ Erreur lors du rejet : ${err.message}`, ephemeral: true });
            }
        }

        // 3. Traduction éphémère du titre & extrait
        if (customId.startsWith('feed_trans:')) {
            const target = customId.replace('feed_trans:', '').trim();
            await interaction.deferReply({ ephemeral: true });

            try {
                const { title, content } = await this._resolveHistoryOrEmbed(target, interaction);
                const trans = await this.feedService.aiService.translateItem({ title, content }, 'fr');

                const translatedTitle = trans?.title || title;
                const translatedExcerpt = trans?.description || 'Traduction non disponible.';

                return interaction.editReply({
                    content: `🇫🇷 **Traduction en Français :**\n\n**${translatedTitle}**\n\n> ${translatedExcerpt}`
                });
            } catch (err) {
                return interaction.editReply({ content: `❌ Impossible de traduire l'article : ${err.message}` });
            }
        }

        // 4. Modal Q&A Assistant IA
        if (customId.startsWith('feed_qa:')) {
            const target = customId.replace('feed_qa:', '').trim();
            const modal = new ModalBuilder()
                .setCustomId(`feed_qa_modal:${target}`)
                .setTitle(`Poser une question sur l'actu`);

            const questionInput = new TextInputBuilder()
                .setCustomId('feed_qa_input')
                .setLabel("Votre question sur l'article :")
                .setPlaceholder('Ex : Quels sont les points clés ou les dates annoncées ?')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(questionInput));
            return interaction.showModal(modal);
        }

        // 5. Résumé Vidéo YouTube
        if (customId.startsWith('feed_vsum:')) {
            const target = customId.replace('feed_vsum:', '').trim();
            await interaction.deferReply({ ephemeral: true });

            try {
                const { title, url } = await this._resolveHistoryOrEmbed(target, interaction);
                const res = await this.feedService.summarizeYouTubeVideo({ url, title });

                return interaction.editReply({
                    content: `🎥 **Synthèse Vidéo YouTube — ${res.title}**\n\n${res.summary}`
                });
            } catch (err) {
                return interaction.editReply({ content: `❌ Échec de la synthèse vidéo : ${err.message}` });
            }
        }

        // --- NOUVEAUTÉS LOT V7 ---

        // 6. Fact-Check & Nuances IA (Pour & Contre)
        if (customId.startsWith('feed_factcheck:')) {
            const target = customId.replace('feed_factcheck:', '').trim();
            await interaction.deferReply({ ephemeral: true });

            try {
                const { title, url, content } = await this._resolveHistoryOrEmbed(target, interaction);
                const historyId = /^\d+$/.test(target) ? Number(target) : null;
                const analysis = await this.feedService.analyzeArticleFactCheck({
                    url,
                    title,
                    content,
                    historyId
                });

                const embed = this.feedService.investigationService.buildFactCheckEmbed(analysis);
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                logger.warn(`[AutofeedInteraction] Erreur fact-check: ${err.message}`, 'AUTOFEEDS');
                return interaction.editReply({ content: `❌ Impossible d'effectuer le fact-check : ${err.message}` });
            }
        }

        // 7. Alerte Sortie & Rappel Personnel (« Préviens-moi à la date J »)
        if (customId.startsWith('feed_remind:')) {
            const target = customId.replace('feed_remind:', '').trim();
            await interaction.deferReply({ ephemeral: true });

            try {
                const { title, url, content } = await this._resolveHistoryOrEmbed(target, interaction);
                const historyId = /^\d+$/.test(target) ? Number(target) : null;

                // Tenter de détecter la date de sortie dans le texte
                let releaseDate = this.feedService.reminderService.detectReleaseDate(`${title} ${content}`);
                if (!releaseDate) {
                    // Par défaut si non spécifié : demain
                    const tmw = new Date();
                    tmw.setDate(tmw.getDate() + 1);
                    releaseDate = tmw.toISOString().slice(0, 10);
                }

                await this.feedService.addReleaseReminder({
                    guildId: interaction.guildId || 'default',
                    channelId: interaction.channelId,
                    userId: interaction.user.id,
                    historyId,
                    releaseDate,
                    itemTitle: title || 'Sortie / Événement',
                    itemUrl: url
                });

                return interaction.editReply({
                    content: `⏰ **Rappel programmé avec succès !**\nVous recevrez un message privé (DM) le jour J (**${releaseDate}**) pour ne pas rater la sortie de : *${title || 'l\'événement'}*.`
                });
            } catch (err) {
                logger.warn(`[AutofeedInteraction] Erreur rappel: ${err.message}`, 'AUTOFEEDS');
                return interaction.editReply({ content: `❌ Impossible d'enregistrer le rappel : ${err.message}` });
            }
        }

        // 8. Fiche Wiki & Synchronisation Base de Connaissances (Obsidian / Notion)
        if (customId.startsWith('feed_wiki:')) {
            const target = customId.replace('feed_wiki:', '').trim();
            await interaction.deferReply({ ephemeral: true });

            try {
                const { title, url, content } = await this._resolveHistoryOrEmbed(target, interaction);
                const item = { title, link: url, content, tags: ['actualite'] };
                const markdown = this.feedService.formatKnowledgeMarkdown(item);

                const embed = this.feedService.knowledgeService.buildWikiExportEmbed(item, {}, false);
                return interaction.editReply({
                    embeds: [embed],
                    content: `\`\`\`markdown\n${markdown.slice(0, 1800)}\n\`\`\``
                });
            } catch (err) {
                logger.warn(`[AutofeedInteraction] Erreur wiki export: ${err.message}`, 'AUTOFEEDS');
                return interaction.editReply({ content: `❌ Impossible de générer la fiche Wiki : ${err.message}` });
            }
        }

        // 9. Réponse au Quiz d'Actu Hebdomadaire
        if (customId.startsWith('feed_trivia_ans:')) {
            const parts = customId.replace('feed_trivia_ans:', '').split(':');
            const quizId = parts[0];
            const optIndex = parts[1];

            if (this.feedService?.triviaService) {
                return this.feedService.triviaService.handleAnswerInteraction(interaction, quizId, optIndex);
            }
        }

        // 10. Mise sur un Marché de Prédiction en XP
        if (customId.startsWith('feed_pred_bet:')) {
            const parts = customId.replace('feed_pred_bet:', '').split(':');
            const predId = parts[0];
            const optIndex = parts[1];

            try {
                const bet = await this.feedService.placePredictionBet({
                    predictionId: predId,
                    userId: interaction.user.id,
                    optionIndex: optIndex,
                    amountXp: 10,
                    guildId: interaction.guildId || 'default'
                });

                return interaction.reply({
                    content: `🎲 **Pari enregistré !** Vous avez misé **10 XP** sur l'option #${parseInt(optIndex, 10) + 1}.\nBonne chance ! Les gains seront redistribués lors de la clôture du marché.`,
                    ephemeral: true
                });
            } catch (err) {
                return interaction.reply({
                    content: `❌ ${err.message}`,
                    ephemeral: true
                });
            }
        }
    }
}

OnEvent('interactionCreate')(AutofeedInteractionListener.prototype, 'handle');

module.exports = { AutofeedInteractionListener };
