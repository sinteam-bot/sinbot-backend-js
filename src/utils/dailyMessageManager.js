const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { saveOpenAIMessage } = require("../database.js");
const { callResponseCustom } = require("./openrouter.js");
const { requestPrompt, formatFinalPrompt } = require("../config/daily_message_config.js");

// Cache en mémoire des brouillons de messages en attente de validation
const pendingDrafts = new Map();

// Configuration des salons
const PREVIEW_CHANNEL_ID = process.env.STARTUP_NOTIFICATION_CHANNEL_ID || '1533492760697503805';
const TARGET_CHANNEL_ID = process.env.DAILY_MESSAGE_CHANNEL_ID || '1337807772024180756';
const TARGET_GUILD_ID = process.env.GUILD_ID || '1337543177086959657';

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
            .setLabel('Accepter & Publier')
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
    const targetChannel = process.env.DAILY_MESSAGE_CHANNEL_ID || TARGET_CHANNEL_ID;
    const embed = new EmbedBuilder()
        .setColor('#F2C7CE')
        .setTitle('📋 [Pré-rendu] Message du jour')
        .setDescription(
            `### 💬 Aperçu du message :\n>>> ${dailyData.text}\n\n` +
            `*Cliquez sur un bouton ci-dessous pour valider la publication ou régénérer un nouveau message.*`
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
                name: '📢 Salon de publication',
                value: `<#${targetChannel}>`,
                inline: true
            }
        )
        .setFooter({ text: 'Validation requise • Chienne Bot' })
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
 * Envoie le pré-rendu du message du jour dans le salon d'administration
 * @param {import('discord.js').Client} client
 * @param {Date} date
 */
async function sendDailyMessagePreview(client, date = new Date()) {
    const previewChannelId = process.env.STARTUP_NOTIFICATION_CHANNEL_ID || PREVIEW_CHANNEL_ID;

    console.log(`📤 [DailyMessage] Envoi du pré-rendu dans le salon ${previewChannelId}...`);

    try {
        const previewChannel = await client.channels.fetch(previewChannelId);
        if (!previewChannel || !previewChannel.isTextBased()) {
            console.error(`❌ [DailyMessage] Salon de prévisualisation introuvable ou non textuel (${previewChannelId})`);
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


        try {
            // Récupérer le salon public cible
            let targetChannel;
            try {
                const guild = await interaction.client.guilds.fetch(TARGET_GUILD_ID, false);
                targetChannel = await guild.channels.fetch(TARGET_CHANNEL_ID);
            } catch {
                targetChannel = await interaction.client.channels.fetch(TARGET_CHANNEL_ID);
            }

            if (!targetChannel || !targetChannel.isTextBased()) {
                throw new Error(`Salon cible introuvable ou non textuel (${TARGET_CHANNEL_ID})`);
            }

            // 1. Envoyer le message final dans le salon public
            const finalEmbed = new EmbedBuilder()
                .setColor('#F2C7CE')
                .setTitle('** Le message du jour **')
                .setDescription(messageText)
                .setTimestamp();

            await targetChannel.send({ embeds: [finalEmbed] });
            console.log(`📢 [DailyMessage] Message officiel publié dans le salon ${targetChannel.name} (${targetChannel.id})`);

            // 2. Sauvegarder en base de données SQLite
            try {
                const messageDb = {
                    msgid: existingDraft?.messageResponse?.msgId || `manual_${Date.now()}`,
                    prompt: existingDraft?.finalPrompt || 'Message validé manuellement',
                    instruction: existingDraft?.finalInstruction || null,
                    model: existingDraft?.model || 'gpt-4o-mini',
                    tokeninput: existingDraft?.messageResponse?.usage?.promptTokens || 0,
                    tokenoutput: existingDraft?.messageResponse?.usage?.completionTokens || 0,
                    content: messageText,
                    type: 'daily_message',
                    previousMsgId: existingDraft?.promptResponse?.msgId || null
                };
                await saveOpenAIMessage(messageDb);
                console.log('💾 [DailyMessage] Message sauvegardé en BDD.');
            } catch (dbErr) {
                console.warn('⚠️ [DailyMessage] Erreur sauvegarde DB:', dbErr.message);
            }

            // 3. Mettre à jour l'embed de pré-rendu pour afficher la confirmation et retirer les boutons
            const validatedEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('✅ [Validé & Publié] Message du jour')
                .setDescription(
                    `### 💬 Message publié :\n>>> ${messageText}\n\n` +
                    `🎉 **Validé par <@${interaction.user.id}> et publié avec succès dans <#${targetChannel.id}> !**`
                )
                .addFields(
                    {
                        name: '📢 Salon',
                        value: `<#${targetChannel.id}>`,
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

            // Nettoyer le cache
            pendingDrafts.delete(message.id);
            console.log(`🎉 [DailyMessage] Validation terminée pour le message ${message.id}`);

        } catch (error) {
            console.error('❌ [DailyMessage] Erreur lors de la publication finale:', error);
            await interaction.followUp({
                content: `❌ Erreur lors de la publication : ${error.message}`,
                ephemeral: true
            });
        }
    }
}

module.exports = {
    generateDailyMessageContent,
    sendDailyMessagePreview,
    handleDailyMessageInteraction,
    buildPreviewEmbed,
    buildActionButtons,
    pendingDrafts
};
