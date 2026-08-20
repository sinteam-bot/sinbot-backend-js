const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { saveOpenAIMessage, getBotState, setBotState } = require("../database.js");
const { callResponseCustom } = require("./openrouter.js");
const { requestPrompt, formatFinalPrompt } = require("../config/daily_message_config.js");

// Cache en mémoire des brouillons de messages en attente de validation
const pendingDrafts = new Map();

// Configuration des salons
const PREVIEW_CHANNEL_ID = process.env.NOTIFICATION_CHANNEL_ID || '1533492760697503805';
const TARGET_CHANNEL_ID = process.env.DAILY_MESSAGE_CHANNEL_ID || '1337807772024180756';
const TARGET_GUILD_ID = process.env.GUILD_ID || '1337543177086959657';

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
 * Génère le contenu du message du jour en 2 étapes via LLM
 * @param {Date} date - Date ciblée
 * @returns {Promise<Object>} Données de génération complètes
 */
async function generateDailyMessageContent(date = new Date()) {
    console.log('🌅 [DailyMessage] Début de la génération...');

    // ÉTAPE 1: Générer le méta-prompt créatif
    console.log('🔄 [DailyMessage] Étape 1/2: Génération du méta-prompt...');
    const promptGenerationOptions = {
        model: process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 1.2,
        maxTokens: 500
    };

    const metaPrompt = requestPrompt(date);
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
    const { prompt: finalPrompt, instruction: finalInstruction } = formatFinalPrompt(promptResponse.text, date);

    const messageOptions = {
        model: process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        systemPrompt: finalInstruction,
        temperature: 0.8,
        maxTokens: 300
    };

    const messageResponse = await callResponseCustom(finalPrompt, messageOptions);
    console.log('✅ [DailyMessage] Message final généré:', messageResponse.text);

    return {
        date,
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
        .setTitle('📋 [Pré-rendu 08:00] Message du jour')
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
                value: `<#${TARGET_CHANNEL_ID}> à **09:00**`,
                inline: true
            }
        )
        .setFooter({ text: 'Validation requise avant 09:00 • Chienne Bot' })
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
 * Envoie le pré-rendu du message du jour dans le salon d'administration à 08:00
 * @param {import('discord.js').Client} client
 * @param {Date} date
 */
async function sendDailyMessagePreview(client, date = new Date()) {

    console.log(`📤 [DailyMessage] Envoi du pré-rendu dans le salon ${PREVIEW_CHANNEL_ID}...`);

    try {
        const previewChannel = await client.channels.fetch(PREVIEW_CHANNEL_ID);
        if (!previewChannel || !previewChannel.isTextBased()) {
            console.error(`❌ [DailyMessage] Salon de notification introuvable ou non textuel (${PREVIEW_CHANNEL_ID})`);
            return null;
        }

        const dailyData = await generateDailyMessageContent(date);
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

        // 3. Vider l'état planifié
        await setBotState('pending_daily_message_publish', '');
        console.log('🎉 [DailyMessage] Publication de 09:00 terminée avec succès !');

    } catch (error) {
        console.error('❌ [DailyMessage 09:00] Erreur lors de la publication planifiée:', error);
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
        const targetDate = existingDraft.date || new Date();

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

        const currentParisHour = getParisHour();
        const draftPayload = {
            ...(existingDraft || {}),
            text: messageText,
            validatedBy: interaction.user.id,
            previewMessageId: message.id,
            previewChannelId: message.channelId
        };

        // Si nous sommes avant 09:00 (ex: pré-rendu validé entre 08:00 et 08:59) -> Planifier pour 09:00
        if (currentParisHour < 9) {
            console.log(`⏳ [DailyMessage] Accepté avant 09:00 (${currentParisHour}h) -> Planification pour 09:00`);

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
            // Si nous sommes à 09:00 ou après -> Publication immédiate
            console.log(`📢 [DailyMessage] Accepté à ou après 09:00 (${currentParisHour}h) -> Publication immédiate`);

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
                // Vider toute planification résiduelle
                await setBotState('pending_daily_message_publish', '');
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
    handleDailyMessageInteraction,
    buildPreviewEmbed,
    buildActionButtons,
    pendingDrafts
};
