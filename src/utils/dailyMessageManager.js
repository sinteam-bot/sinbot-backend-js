const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { saveOpenAIMessage, getBotState, setBotState } = require("../database.js");
const { callResponseCustom } = require("./openrouter.js");
const { requestPrompt, formatFinalPrompt } = require("../config/daily_message_config.js");
const { config } = require("../config/index.js");

// Cache en mémoire des brouillons de messages en attente de validation
const pendingDrafts = new Map();

// Configuration des salons
const PREVIEW_CHANNEL_ID = config.daily_message?.preview_channel_id || config.startup_notifier?.channel_id || process.env.LOG_CHANNEL_ID;
const TARGET_CHANNEL_ID = config.daily_message?.channel_id || process.env.DAILY_MESSAGE_CHANNEL_ID;
const TARGET_GUILD_ID = config.discord?.guild_id || process.env.GUILD_ID;

/**
 * Récupère l'heure actuelle au fuseau horaire de Paris
 * @returns {number} Heure de 0 à 23
 */
function getParisHour() {
    try {
        const formatter = new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'Europe/Paris',
            hour: 'numeric',
            hour12: false
        });
        return parseInt(formatter.format(new Date()), 10);
    } catch {
        return new Date().getHours();
    }
}

/**
 * Récupère la date actuelle au format YYYY-MM-DD (fuseau Paris)
 * @param {Date} date
 * @returns {string} Date au format YYYY-MM-DD
 */
function getParisDateString(date = new Date()) {
    try {
        const formatter = new Intl.DateTimeFormat('fr-CA', {
            timeZone: 'Europe/Paris',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        return formatter.format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

/**
 * Détermine la date cible pour le message du jour.
 * Si le pré-rendu est généré le soir (ex: à 21h), la date ciblée est celle du lendemain.
 * @param {Date} baseDate
 * @returns {Date}
 */
function getTargetDailyDate(baseDate = new Date()) {
    const parisHour = getParisHour();
    if (parisHour >= 12) {
        const tomorrow = new Date(baseDate.getTime());
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    }
    return baseDate;
}

/**
 * Génère le contenu du message du jour en 2 étapes via LLM
 * @param {Date} date - Date ciblée
 * @returns {Promise<Object>} Données de génération complètes
 */
async function generateDailyMessageContent(date = null) {
    const targetDate = date || getTargetDailyDate();
    console.log(`🌅 [DailyMessage] Début de la génération pour le ${getParisDateString(targetDate)}...`);

    const aiConfig = config.daily_message?.ai_config || {};
    const selectedModel = aiConfig.model || config.openrouter?.default_model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

    // ÉTAPE 1: Générer le méta-prompt créatif
    console.log('🔄 [DailyMessage] Étape 1/2: Génération du méta-prompt...');
    const promptGenerationOptions = {
        model: selectedModel,
        temperature: 1.2,
        maxTokens: 500
    };

    const metaPrompt = requestPrompt(targetDate);
    const promptResponse = await callResponseCustom(metaPrompt, promptGenerationOptions);
    console.log('✅ [DailyMessage] Prompt créatif généré:', promptResponse.text);

    // Sauvegarder la génération du prompt en base
    try {
        const promptGenerationDb = {
            msgid: promptResponse.msgId,
            prompt: metaPrompt,
            instruction: promptGenerationOptions.systemPrompt || null,
            model: promptResponse.model,
            tokeninput: promptResponse.usage?.promptTokens || 0,
            tokenoutput: promptResponse.usage?.completionTokens || 0,
            content: promptResponse.text,
            type: 'prompt_generation'
        };
        await saveOpenAIMessage(promptGenerationDb);
    } catch (dbErr) {
        console.warn('⚠️ [DailyMessage] Erreur sauvegarde DB prompt:', dbErr.message);
    }

    // ÉTAPE 2: Générer le message final
    console.log('🔄 [DailyMessage] Étape 2/2: Génération du message final...');
    const { prompt: finalPrompt, instruction: finalInstruction } = formatFinalPrompt(promptResponse.text, targetDate);

    const messageOptions = {
        model: selectedModel,
        systemPrompt: finalInstruction,
        temperature: aiConfig.temperature !== undefined ? aiConfig.temperature : 0.8,
        maxTokens: aiConfig.max_tokens || 300
    };

    const messageResponse = await callResponseCustom(finalPrompt, messageOptions);
    console.log('✅ [DailyMessage] Message final généré:', messageResponse.text);

    return {
        date: targetDate,
        metaPrompt,
        promptResponse,
        finalPrompt,
        finalInstruction,
        messageResponse,
        text: messageResponse.text,
        model: messageResponse.model || messageOptions.model
    };
}

/**
 * Construit la rangée de boutons pour l'action sur le pré-rendu
 * @param {boolean} disabled - Désactiver ou non les boutons
 */
function buildActionButtons(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('daily_msg_accept')
            .setLabel('Accepter (Diffusion à 09:00)')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('daily_msg_reject')
            .setLabel('Refuser & Régénérer')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔄')
            .setDisabled(disabled)
    );
}

/**
 * Construit l'Embed de pré-rendu
 * @param {Object} dailyData - Données du message du jour
 * @param {Object} options - Options d'affichage (nombre de régénérations, auteur du refus)
 */
function buildPreviewEmbed(dailyData, options = {}) {
    const embed = new EmbedBuilder()
        .setColor('#F2C7CE')
        .setTitle('📋 [Pré-rendu 21:00] Message du jour')
        .setDescription(
            `### 💬 Aperçu du message :\n>>> ${dailyData.text}\n\n` +
            `*Cliquez sur un bouton ci-dessous pour valider la diffusion programmée à 09:00 ou régénérer un nouveau texte.*`
        )
        .addFields(
            {
                name: '📅 Date ciblée',
                value: `<t:${Math.floor(dailyData.date.getTime() / 1000)}:D>`,
                inline: true
            },
            {
                name: '🤖 Modèle',
                value: `\`${dailyData.model || 'gpt-4o-mini'}\``,
                inline: true
            },
            {
                name: '📢 Salon & Heure cible',
                value: `<#${TARGET_CHANNEL_ID}> à **09:00** (auto à 11:00)`,
                inline: true
            }
        )
        .setFooter({ text: 'Validation avant 09:00 (Auto à 11:00) • Chienne Bot' })
        .setTimestamp();

    if (options.regenCount && options.regenCount > 0) {
        embed.addFields({
            name: '🔄 Historique de régénération',
            value: `Régénéré **${options.regenCount} fois**${options.rejectedBy ? ` (dernier refus par <@${options.rejectedBy}>)` : ''}`,
            inline: false
        });
    }

    return embed;
}

/**
 * Envoie le pré-rendu du message du jour dans le salon d'administration à 21:00
 * @param {import('discord.js').Client} client
 * @param {Date|null} date
 */
async function sendDailyMessagePreview(client, date = null) {
    console.log(`📤 [DailyMessage] Envoi du pré-rendu dans le salon ${PREVIEW_CHANNEL_ID}...`);

    try {
        const previewChannel = await client.channels.fetch(PREVIEW_CHANNEL_ID);
        if (!previewChannel || !previewChannel.isTextBased()) {
            console.error(`❌ [DailyMessage] Salon de notification introuvable ou non textuel (${PREVIEW_CHANNEL_ID})`);
            return null;
        }

        const targetDate = date || getTargetDailyDate();
        const dailyData = await generateDailyMessageContent(targetDate);
        const embed = buildPreviewEmbed(dailyData);
        const actionRow = buildActionButtons(false);

        const sentMessage = await previewChannel.send({
            embeds: [embed],
            components: [actionRow]
        });

        // Enregistrer le brouillon en mémoire pour la gestion des interactions
        pendingDrafts.set(sentMessage.id, {
            ...dailyData,
            regenCount: 0
        });

        console.log(`✅ [DailyMessage] Pré-rendu envoyé avec succès (Message ID: ${sentMessage.id})`);
        return sentMessage;
    } catch (error) {
        console.error('❌ [DailyMessage] Erreur lors de l\'envoi du pré-rendu:', error);
        throw error;
    }
}

/**
 * Publie effectivement un message du jour validé dans le salon public
 * @param {import('discord.js').Client} client
 * @param {Object} draftData - Données du message à publier
 */
async function executePublicPublication(client, draftData) {
    const targetChannelId = process.env.DAILY_MESSAGE_CHANNEL_ID || TARGET_CHANNEL_ID;
    const targetGuildId = process.env.GUILD_ID || TARGET_GUILD_ID;

    let targetChannel;
    try {
        const guild = await client.guilds.fetch(targetGuildId, false);
        targetChannel = await guild.channels.fetch(targetChannelId);
    } catch {
        targetChannel = await client.channels.fetch(targetChannelId);
    }

    if (!targetChannel || !targetChannel.isTextBased()) {
        throw new Error(`Salon cible introuvable ou non textuel (${targetChannelId})`);
    }

    // 1. Envoyer l'embed public
    const finalEmbed = new EmbedBuilder()
        .setColor('#F2C7CE')
        .setTitle('** Le message du jour **')
        .setDescription(draftData.text)
        .setTimestamp();

    await targetChannel.send({ embeds: [finalEmbed] });
    console.log(`📢 [DailyMessage] Message officiel publié dans ${targetChannel.name} (${targetChannel.id})`);

    // 2. Sauvegarder en base de données SQLite
    try {
        const messageDb = {
            msgid: draftData.messageResponse?.msgId || `manual_${Date.now()}`,
            prompt: draftData.finalPrompt || 'Message validé',
            instruction: draftData.finalInstruction || null,
            model: draftData.model || 'gpt-4o-mini',
            tokeninput: draftData.messageResponse?.usage?.promptTokens || 0,
            tokenoutput: draftData.messageResponse?.usage?.completionTokens || 0,
            content: draftData.text,
            type: 'daily_message',
            previousMsgId: draftData.promptResponse?.msgId || null
        };
        await saveOpenAIMessage(messageDb);
        console.log('💾 [DailyMessage] Message final sauvegardé en BDD.');
    } catch (dbErr) {
        console.warn('⚠️ [DailyMessage] Erreur sauvegarde DB:', dbErr.message);
    }
}

/**
 * Fonction appelée à 09:00 par le cron pour publier le message préalablement validé
 * @param {import('discord.js').Client} client
 */
async function publishScheduledDailyMessage(client) {
    console.log('⏰ [DailyMessage 09:00] Vérification de la publication planifiée...');

    try {
        const todayDateStr = getParisDateString();
        const lastSentDate = await getBotState('last_daily_message_published_date');
        if (lastSentDate === todayDateStr) {
            console.log('ℹ️ [DailyMessage 09:00] Le message du jour a déjà été envoyé aujourd\'hui.');
            return;
        }

        const rawScheduled = await getBotState('pending_daily_message_publish');
        if (!rawScheduled) {
            console.log('ℹ️ [DailyMessage 09:00] Aucun message validé en attente de publication.');
            return;
        }

        const scheduledData = JSON.parse(rawScheduled);
        if (!scheduledData || !scheduledData.text) {
            console.warn('⚠️ [DailyMessage 09:00] Données de message planifié invalides.');
            return;
        }

        // 1. Publier dans le salon cible
        await executePublicPublication(client, scheduledData);

        // 2. Mettre à jour le message de prévisualisation si accessible
        if (scheduledData.previewMessageId && scheduledData.previewChannelId) {
            try {
                const previewChan = await client.channels.fetch(scheduledData.previewChannelId);
                const previewMsg = await previewChan.messages.fetch(scheduledData.previewMessageId);

                const publishedEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('✅ [Publié à 09:00] Message du jour')
                    .setDescription(
                        `### 💬 Message diffusé :\n>>> ${scheduledData.text}\n\n` +
                        `🎉 **Le message a été automatiquement publié à 09:00 dans <#${TARGET_CHANNEL_ID}> !**`
                    )
                    .addFields(
                        {
                            name: '📢 Salon',
                            value: `<#${TARGET_CHANNEL_ID}>`,
                            inline: true
                        },
                        {
                            name: '👤 Validé par',
                            value: scheduledData.validatedBy ? `<@${scheduledData.validatedBy}>` : 'Modérateur',
                            inline: true
                        },
                        {
                            name: '⏱️ Heure de diffusion',
                            value: `<t:${Math.floor(Date.now() / 1000)}:T>`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'Diffusé à 09:00 • Chienne Bot' })
                    .setTimestamp();

                await previewMsg.edit({
                    embeds: [publishedEmbed],
                    components: []
                });
            } catch (editErr) {
                console.warn('⚠️ [DailyMessage] Impossible de mettre à jour le message de prévisualisation:', editErr.message);
            }
        }

        // 3. Vider l'état planifié et marquer la date du jour comme envoyée
        await setBotState('pending_daily_message_publish', '');
        await setBotState('last_daily_message_published_date', todayDateStr);
        console.log('🎉 [DailyMessage] Publication de 09:00 terminée avec succès !');

    } catch (error) {
        console.error('❌ [DailyMessage 09:00] Erreur lors de la publication planifiée:', error);
    }
}

/**
 * Fonction appelée à 11:00 par le cron pour valider et publier automatiquement
 * le message du jour si aucune validation manuelle n'a eu lieu avant 11:00.
 * @param {import('discord.js').Client} client
 */
async function autoValidateAndPublishDailyMessage(client) {
    console.log('⏰ [DailyMessage 11:00] Vérification de la validation/publication automatique...');

    try {
        const todayDateStr = getParisDateString();
        const lastSentDate = await getBotState('last_daily_message_published_date');

        // Si déjà envoyé aujourd'hui, ne rien faire
        if (lastSentDate === todayDateStr) {
            console.log('ℹ️ [DailyMessage 11:00] Le message du jour a déjà été publié aujourd\'hui.');
            return;
        }

        // 1. Vérifier s'il y a un message déjà planifié (au cas où il n'a pas pu partir à 09:00)
        const rawScheduled = await getBotState('pending_daily_message_publish');
        if (rawScheduled) {
            console.log('📢 [DailyMessage 11:00] Un message était déjà planifié, publication immédiate...');
            await publishScheduledDailyMessage(client);
            return;
        }

        // 2. Chercher dans les brouillons en mémoire (pendingDrafts) ou dans le canal d'administration
        let draftToPublish = null;
        let previewMsg = null;

        // Chercher dans le cache mémoire
        for (const [msgId, draft] of pendingDrafts.entries()) {
            if (draft && draft.text) {
                draftToPublish = { ...draft, previewMessageId: msgId, previewChannelId: PREVIEW_CHANNEL_ID };
                break;
            }
        }

        // Si non trouvé en mémoire (ex: reboot du bot), chercher le dernier pré-rendu dans le canal preview
        if (!draftToPublish) {
            try {
                const previewChan = await client.channels.fetch(PREVIEW_CHANNEL_ID);
                if (previewChan && previewChan.isTextBased()) {
                    const messages = await previewChan.messages.fetch({ limit: 15 });
                    for (const m of messages.values()) {
                        if (m.author.id === client.user.id && m.embeds.length > 0 && m.components.length > 0) {
                            const embed = m.embeds[0];
                            if (embed.title && embed.title.includes('Pré-rendu') && embed.description) {
                                const match = embed.description.match(/>>> ([\s\S]*?)(?:\n\n\*|$)/);
                                const text = match ? match[1].trim() : embed.description;
                                if (text) {
                                    draftToPublish = {
                                        text,
                                        previewMessageId: m.id,
                                        previewChannelId: previewChan.id
                                    };
                                    previewMsg = m;
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (fetchErr) {
                console.warn('⚠️ [DailyMessage 11:00] Impossible de chercher le message de pré-rendu:', fetchErr.message);
            }
        }

        // 3. Si aucun pré-rendu n'existe (ex: bot arrêté hier soir à 21h), en générer un immédiatement
        if (!draftToPublish || !draftToPublish.text) {
            console.log('🔄 [DailyMessage 11:00] Aucun pré-rendu trouvé. Génération automatique du message du jour...');
            const dailyData = await generateDailyMessageContent(new Date());
            draftToPublish = {
                ...dailyData,
                text: dailyData.text
            };
        }

        // 4. Publier dans le salon cible
        await executePublicPublication(client, draftToPublish);

        // 5. Mettre à jour l'embed de pré-rendu (s'il existe)
        if (draftToPublish.previewMessageId && draftToPublish.previewChannelId) {
            try {
                if (!previewMsg) {
                    const previewChan = await client.channels.fetch(draftToPublish.previewChannelId);
                    previewMsg = await previewChan.messages.fetch(draftToPublish.previewMessageId);
                }

                const autoEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('🤖 [Validation automatique à 11:00 & Publié] Message du jour')
                    .setDescription(
                        `### 💬 Message diffusé :\n>>> ${draftToPublish.text}\n\n` +
                        `🤖 **Aucune validation manuelle avant 11:00. Le message a été validé et publié automatiquement dans <#${TARGET_CHANNEL_ID}> !**`
                    )
                    .addFields(
                        {
                            name: '📢 Salon',
                            value: `<#${TARGET_CHANNEL_ID}>`,
                            inline: true
                        },
                        {
                            name: '👤 Type de validation',
                            value: '🤖 **Automatique (11:00)**',
                            inline: true
                        },
                        {
                            name: '⏱️ Heure de diffusion',
                            value: `<t:${Math.floor(Date.now() / 1000)}:T>`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'Validation automatique à 11:00 • Chienne Bot' })
                    .setTimestamp();

                await previewMsg.edit({
                    embeds: [autoEmbed],
                    components: []
                });
            } catch (editErr) {
                console.warn('⚠️ [DailyMessage 11:00] Impossible de mettre à jour le pré-rendu:', editErr.message);
            }
        }

        // 6. Nettoyer les caches et marquer comme envoyé
        if (draftToPublish.previewMessageId) {
            pendingDrafts.delete(draftToPublish.previewMessageId);
        }
        await setBotState('pending_daily_message_publish', '');
        await setBotState('last_daily_message_published_date', todayDateStr);
        console.log('🎉 [DailyMessage 11:00] Validation et publication automatique terminées avec succès !');

    } catch (error) {
        console.error('❌ [DailyMessage 11:00] Erreur lors de la validation automatique:', error);
    }
}

/**
 * Gère les interactions avec les boutons du pré-rendu
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleDailyMessageInteraction(interaction) {
    const { customId, message } = interaction;

    if (customId === 'daily_msg_reject') {
        console.log(`🔄 [DailyMessage] Refus et demande de régénération par ${interaction.user.tag}`);

        const existingDraft = pendingDrafts.get(message.id) || {};
        const regenCount = (existingDraft.regenCount || 0) + 1;
        const targetDate = existingDraft.date || getTargetDailyDate();

        try {
            // Indiquer visuellement que la régénération est en cours
            const loadingEmbed = EmbedBuilder.from(message.embeds[0] || new EmbedBuilder())
                .setColor('#FFA500')
                .setTitle('⏳ Régénération du message du jour en cours...')
                .setDescription(
                    `*Régénération demandée par <@${interaction.user.id}>...*\n\n` +
                    `*Génération d'un nouveau prompt et du texte en cours, veuillez patienter quelques secondes.*`
                );

            await interaction.update({
                embeds: [loadingEmbed],
                components: [buildActionButtons(true)]
            });

            // Générer un nouveau contenu
            const newDailyData = await generateDailyMessageContent(targetDate);
            const newEmbed = buildPreviewEmbed(newDailyData, {
                regenCount,
                rejectedBy: interaction.user.id
            });
            const newActionRow = buildActionButtons(false);

            // Mettre à jour le message avec le nouveau pré-rendu
            await message.edit({
                embeds: [newEmbed],
                components: [newActionRow]
            });

            // Mettre à jour le cache
            pendingDrafts.set(message.id, {
                ...newDailyData,
                regenCount,
                rejectedBy: interaction.user.id
            });

            console.log(`✅ [DailyMessage] Nouveau pré-rendu mis à jour (itération #${regenCount})`);
        } catch (error) {
            console.error('❌ [DailyMessage] Erreur lors de la régénération:', error);
            await message.edit({
                content: `❌ Erreur lors de la régénération : ${error.message}`,
                components: [buildActionButtons(false)]
            });
        }

    } else if (customId === 'daily_msg_accept') {
        console.log(`✅ [DailyMessage] Message accepté par ${interaction.user.tag}`);

        const currentParisHour = getParisHour();
        const todayDateStr = getParisDateString();

        // Si le message a déjà été diffusé aujourd'hui et qu'on est en journée
        const lastSentDate = await getBotState('last_daily_message_published_date');
        if (lastSentDate === todayDateStr && currentParisHour >= 9) {
            await interaction.reply({
                content: 'ℹ️ Le message du jour a déjà été publié pour aujourd\'hui.',
                ephemeral: true
            });
            try {
                await message.edit({ components: [] });
            } catch {}
            return;
        }

        const existingDraft = pendingDrafts.get(message.id);
        let messageText = existingDraft?.text;

        // Fallback d'extraction depuis l'embed si le cache n'est pas trouvé
        if (!messageText && message.embeds[0]?.description) {
            const match = message.embeds[0].description.match(/>>> ([\s\S]*?)(?:\n\n\*|$)/);
            messageText = match ? match[1].trim() : message.embeds[0].description;
        }

        if (!messageText) {
            await interaction.reply({
                content: '❌ Impossible de récupérer le texte du message validé.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        const draftPayload = {
            ...(existingDraft || {}),
            text: messageText,
            validatedBy: interaction.user.id,
            previewMessageId: message.id,
            previewChannelId: message.channelId
        };

        // RÈGLE 1 : Si validé entre 21h et 9h (ex: 21h-23h59 ou 00h-08h59) -> Planifier pour 09:00
        if (currentParisHour >= 21 || currentParisHour < 9) {
            console.log(`⏳ [DailyMessage] Accepté entre 21h et 09h (${currentParisHour}h) -> Planification pour 09:00`);

            // Sauvegarder l'état planifié en base SQLite (persistant aux reboots)
            await setBotState('pending_daily_message_publish', JSON.stringify(draftPayload));

            // Mettre à jour l'embed de pré-rendu pour confirmer la planification à 09:00
            const scheduledEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('⏳ [Validé - Diffusion à 09:00] Message du jour')
                .setDescription(
                    `### 💬 Message validé :\n>>> ${messageText}\n\n` +
                    `✅ **Validé par <@${interaction.user.id}> !**\n` +
                    `⏰ **Le message sera automatiquement publié dans <#${TARGET_CHANNEL_ID}> à 09:00.**`
                )
                .addFields(
                    {
                        name: '📢 Salon cible',
                        value: `<#${TARGET_CHANNEL_ID}>`,
                        inline: true
                    },
                    {
                        name: '👤 Validé par',
                        value: `<@${interaction.user.id}>`,
                        inline: true
                    },
                    {
                        name: '⏰ Heure de diffusion',
                        value: `**09:00** (Paris)`,
                        inline: true
                    }
                )
                .setFooter({ text: 'Programmé pour 09:00 • Chienne Bot' })
                .setTimestamp();

            await message.edit({
                embeds: [scheduledEmbed],
                components: []
            });

            pendingDrafts.delete(message.id);
            console.log(`🎉 [DailyMessage] Message programmé pour diffusion à 09:00`);

        } else {
            // RÈGLE 2 : Si validé après 09:00 (ex: 09h-11h) -> Publication immédiate
            console.log(`📢 [DailyMessage] Accepté après 09:00 (${currentParisHour}h) -> Publication immédiate`);

            try {
                await executePublicPublication(interaction.client, draftPayload);

                const validatedEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('✅ [Validé & Publié] Message du jour')
                    .setDescription(
                        `### 💬 Message publié :\n>>> ${messageText}\n\n` +
                        `🎉 **Validé par <@${interaction.user.id}> et publié avec succès dans <#${TARGET_CHANNEL_ID}> !**`
                    )
                    .addFields(
                        {
                            name: '📢 Salon',
                            value: `<#${TARGET_CHANNEL_ID}>`,
                            inline: true
                        },
                        {
                            name: '👤 Validé par',
                            value: `<@${interaction.user.id}>`,
                            inline: true
                        },
                        {
                            name: '⏱️ Publié le',
                            value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'Publié • Chienne Bot' })
                    .setTimestamp();

                await message.edit({
                    embeds: [validatedEmbed],
                    components: []
                });

                pendingDrafts.delete(message.id);
                // Vider la planification résiduelle et marquer le jour comme envoyé
                await setBotState('pending_daily_message_publish', '');
                await setBotState('last_daily_message_published_date', todayDateStr);
            } catch (error) {
                console.error('❌ [DailyMessage] Erreur lors de la publication immédiate:', error);
                await interaction.followUp({
                    content: `❌ Erreur lors de la publication : ${error.message}`,
                    ephemeral: true
                });
            }
        }
    }
}

module.exports = {
    generateDailyMessageContent,
    sendDailyMessagePreview,
    publishScheduledDailyMessage,
    autoValidateAndPublishDailyMessage,
    handleDailyMessageInteraction,
    buildPreviewEmbed,
    buildActionButtons,
    getParisHour,
    getParisDateString,
    pendingDrafts
};
