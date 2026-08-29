const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Injectable, Cron } = require('../../core/index.js');
const { DailyMessageRepository } = require('./daily-message.repository.js');
const { config, getConfig } = require('../../config/index.js');
const { callResponseCustom } = require('../../utils/openrouter.js');
const { requestPrompt, formatFinalPrompt } = require('./daily-message.config.js');
const { getParisHour, getParisDateString, toISOStringSafe } = require('../../utils/dateUtils.js');

class DailyMessageService {
    static inject = [DailyMessageRepository];

    constructor(repository) {
        this.repo = repository;
        this.pendingDrafts = new Map();
    }

    getConfig() {
        const currentConfig = getConfig ? getConfig() : config;
        return currentConfig.daily_message || {};
    }

    getTargetDailyDate(baseDate = new Date()) {
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
     */
    async generateDailyMessageContent(date = null) {
        const targetDate = date || this.getTargetDailyDate();
        console.log(`🌅 [DailyMessage] Début de la génération pour le ${getParisDateString(targetDate)}...`);

        const aiConfig = this.getConfig().ai_config || {};
        const conf = getConfig ? getConfig() : config;
        const selectedModel = aiConfig.model || conf.openrouter?.default_model || process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';

        try {
            // Étape 1 : Méta-prompt créatif
            const promptGenerationOptions = {
                model: selectedModel,
                temperature: 1.2,
                maxTokens: 500,
                allowFallback: true
            };

            const metaPrompt = requestPrompt(targetDate);
            const promptResponse = await callResponseCustom(metaPrompt, promptGenerationOptions);

            try {
                await this.repo.saveAiMessage({
                    msgid: promptResponse.msgId,
                    prompt: metaPrompt,
                    instruction: promptGenerationOptions.systemPrompt || null,
                    model: promptResponse.model,
                    tokeninput: promptResponse.usage?.promptTokens || 0,
                    tokenoutput: promptResponse.usage?.completionTokens || 0,
                    content: promptResponse.text,
                    type: 'prompt_generation'
                });
            } catch (err) {
                console.warn('⚠️ [DailyMessage] Erreur sauvegarde prompt DB:', err.message);
            }

            // Étape 2 : Message final
            const { prompt: finalPrompt, instruction: finalInstruction } = formatFinalPrompt(promptResponse.text, targetDate);

            const messageOptions = {
                model: selectedModel,
                systemPrompt: finalInstruction,
                temperature: aiConfig.temperature !== undefined ? aiConfig.temperature : 0.8,
                maxTokens: aiConfig.max_tokens || 300,
                allowFallback: true
            };

            const messageResponse = await callResponseCustom(finalPrompt, messageOptions);

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
        } catch (error) {
            console.error('❌ [DailyMessage] Erreur lors de la génération IA:', error.message);
            throw new Error(`Échec de génération IA (${error.message}). Vérifiez votre clé OpenRouter ou votre modèle configuré.`);
        }
    }

    buildActionButtons(disabled = false) {
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

    buildPreviewEmbed(dailyData, options = {}) {
        const targetChannelId = this.getConfig().channel_id || process.env.DAILY_MESSAGE_CHANNEL_ID;

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
                    value: `<#${targetChannelId}> à **09:00** (auto à 11:00)`,
                    inline: true
                }
            )
            .setFooter({ text: 'Validation avant 09:00 (Auto à 11:00) • Bot' })
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
     * Envoie le pré-rendu dans le salon de modération à 21h00
     */
    async sendPreview(client, date = null) {
        const conf = this.getConfig();
        if (conf.enabled === false) return null;

        const previewChannelId = conf.preview_channel_id || config.startup_notifier?.channel_id || process.env.LOG_CHANNEL_ID;
        if (!previewChannelId) {
            console.warn('⚠️ [DailyMessage] Aucun salon de pré-rendu configuré.');
            return null;
        }

        try {
            const previewChannel = await client.channels.fetch(previewChannelId);
            if (!previewChannel || !previewChannel.isTextBased()) return null;

            const targetDate = date || this.getTargetDailyDate();
            const dailyData = await this.generateDailyMessageContent(targetDate);
            const embed = this.buildPreviewEmbed(dailyData);
            const actionRow = this.buildActionButtons(false);

            const sentMessage = await previewChannel.send({
                embeds: [embed],
                components: [actionRow]
            });

            this.pendingDrafts.set(sentMessage.id, {
                ...dailyData,
                regenCount: 0
            });

            await this.saveCurrentDraft(dailyData);

            console.log(`✅ [DailyMessage] Pré-rendu envoyé avec succès (ID: ${sentMessage.id})`);
            return sentMessage;
        } catch (error) {
            console.error('❌ [DailyMessage] Erreur envoi pré-rendu:', error);
            throw error;
        }
    }

    /**
     * Publie le message validé dans le salon public
     */
    async executePublication(client, draftData) {
        if (!draftData) {
            console.warn('⚠️ [DailyMessage] executePublication appelé avec un draft vide ou null.');
            return false;
        }

        let textContent = '';
        if (typeof draftData === 'string') {
            textContent = draftData;
        } else if (typeof draftData === 'object') {
            textContent = draftData.text || draftData.content || draftData.message || '';
        }

        if (!textContent || !textContent.trim()) {
            console.warn('⚠️ [DailyMessage] Le texte du message à publier est vide.');
            return false;
        }

        const conf = this.getConfig();
        const targetChannelId = conf.channel_id || process.env.DAILY_MESSAGE_CHANNEL_ID;
        const targetGuildId = config.discord?.guild_id || process.env.GUILD_ID;

        let targetChannel;
        try {
            const guild = await client.guilds.fetch(targetGuildId, false);
            targetChannel = await guild.channels.fetch(targetChannelId);
        } catch {
            targetChannel = await client.channels.fetch(targetChannelId);
        }

        if (!targetChannel || !targetChannel.isTextBased()) {
            throw new Error(`Salon cible introuvable (${targetChannelId})`);
        }

        const finalEmbed = new EmbedBuilder()
            .setColor('#F2C7CE')
            .setTitle('** Le message du jour **')
            .setDescription(textContent)
            .setTimestamp();

        await targetChannel.send({ embeds: [finalEmbed] });
        console.log(`📢 [DailyMessage] Message publié dans #${targetChannel.name}`);

        const aiConfig = this.getConfig().ai_config || {};
        const configFull = getConfig ? getConfig() : config;
        const fallbackModel = aiConfig.model || configFull.openrouter?.default_model || 'nvidia/nemotron-3-ultra-550b-a55b:free';

        try {
            await this.repo.saveAiMessage({
                msgid: draftData.messageResponse?.msgId || `manual_${Date.now()}`,
                prompt: draftData.finalPrompt || 'Message validé',
                instruction: draftData.finalInstruction || null,
                model: draftData.model || fallbackModel,
                tokeninput: draftData.messageResponse?.usage?.promptTokens || 0,
                tokenoutput: draftData.messageResponse?.usage?.completionTokens || 0,
                content: textContent,
                type: 'daily_message',
                previousMsgId: draftData.promptResponse?.msgId || null
            });
        } catch (dbErr) {
            console.warn('⚠️ [DailyMessage] Erreur sauvegarde BDD message:', dbErr.message);
        }

        const todayParis = getParisDateString(new Date());
        await this.repo.setLastPublishedDate(todayParis);
        await this.repo.setBotState('daily_msg_accepted_draft', null);
        await this.repo.setBotState('daily_msg_current_draft', null);

        return true;
    }

    /**
     * Diffusion planifiée à 09:00
     */
    async publishScheduled(client) {
        const conf = this.getConfig();
        if (conf.enabled === false) return;

        const todayParis = getParisDateString(new Date());
        const lastPubDate = await this.repo.getLastPublishedDate();

        if (lastPubDate === todayParis) {
            console.log('ℹ️ [DailyMessage 09:00] Déjà publié aujourd\'hui.');
            return;
        }

        const acceptedDraft = await this.repo.getBotState('daily_msg_accepted_draft');
        if (acceptedDraft && acceptedDraft !== 'null' && acceptedDraft !== 'undefined') {
            let draft = null;
            try {
                draft = typeof acceptedDraft === 'string' ? JSON.parse(acceptedDraft) : acceptedDraft;
            } catch (e) {
                draft = acceptedDraft;
            }

            if (draft && (draft.text || (typeof draft === 'string' && draft.trim()))) {
                await this.executePublication(client, draft);
                await this.repo.setBotState('daily_msg_accepted_draft', null);
                return;
            }
        }

        console.log('ℹ️ [DailyMessage 09:00] Aucun message validé manuellement. La publication auto aura lieu à 11:00.');
    }

    /**
     * Publication automatique à 11:00
     */
    async autoValidateAndPublish(client) {
        const conf = this.getConfig();
        if (conf.enabled === false) return;

        const todayParis = getParisDateString(new Date());
        const lastPubDate = await this.repo.getLastPublishedDate();

        if (lastPubDate === todayParis) {
            console.log('ℹ️ [DailyMessage 11:00] Déjà publié aujourd\'hui.');
            return;
        }

        let draft = await this.repo.getBotState('daily_msg_accepted_draft');
        if (draft && draft !== 'null' && draft !== 'undefined') {
            try {
                draft = typeof draft === 'string' ? JSON.parse(draft) : draft;
            } catch (e) {
                // keep as string
            }
        } else {
            draft = null;
        }

        if (!draft || (!draft.text && typeof draft !== 'string')) {
            console.log('🔄 [DailyMessage 11:00] Génération automatique du message...');
            draft = await this.generateDailyMessageContent(new Date());
        }

        if (draft) {
            await this.executePublication(client, draft);
            await this.repo.setBotState('daily_msg_accepted_draft', null);
        }
    }

    /**
     * Traite les clics sur les boutons Accept / Reject
     */
    async handleButtonInteraction(interaction) {
        if (!interaction.isButton || !interaction.isButton()) return;
        const customId = interaction.customId;
        if (customId !== 'daily_msg_accept' && customId !== 'daily_msg_reject') return;

        // Éviter d'acquitter une interaction déjà traitée
        if (interaction.deferred || interaction.replied) {
            return;
        }

        try {
            await interaction.deferUpdate();
        } catch (err) {
            if (err.code === 10062 || err.code === 40060) {
                return;
            }
            console.warn('⚠️ [DailyMessage] Erreur deferUpdate:', err.message);
        }

        const messageId = interaction.message.id;
        let draft = this.pendingDrafts.get(messageId);

        if (!draft) {
            // Extraire le texte de l'embed existant
            const embed = interaction.message.embeds[0];
            const textMatch = embed?.description?.match(/>>> ([\s\S]*?)(?:\n\n\*|$)/);
            const text = textMatch ? textMatch[1].trim() : (embed?.description || '');
            draft = {
                text,
                date: new Date(),
                regenCount: 0
            };
        }

        if (customId === 'daily_msg_accept') {
            await this.repo.setBotState('daily_msg_accepted_draft', JSON.stringify(draft));
            await this.repo.setBotState('daily_msg_current_draft', null);

            const successEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#2ecc71')
                .setTitle('✅ [Validé] Message du jour programmé pour 09:00')
                .setFooter({ text: `Validé par @${interaction.user.username} • Bot` });

            await interaction.editReply({
                embeds: [successEmbed],
                components: [this.buildActionButtons(true)]
            }).catch(err => console.warn('⚠️ [DailyMessage] Erreur editReply accept:', err.message));

            console.log(`✅ [DailyMessage] Brouillon accepté par @${interaction.user.tag}`);

        } else if (customId === 'daily_msg_reject') {
            const currentRegen = (draft.regenCount || 0) + 1;
            console.log(`🔄 [DailyMessage] Brouillon refusé par @${interaction.user.tag}. Régénération #${currentRegen}...`);

            const newDraft = await this.generateDailyMessageContent(draft.date);
            await this.saveCurrentDraft(newDraft);

            const newEmbed = this.buildPreviewEmbed(newDraft, {
                regenCount: currentRegen,
                rejectedBy: interaction.user.id
            });

            this.pendingDrafts.set(messageId, {
                ...newDraft,
                regenCount: currentRegen
            });

            await interaction.editReply({
                embeds: [newEmbed],
                components: [this.buildActionButtons(false)]
            }).catch(err => console.warn('⚠️ [DailyMessage] Erreur editReply reject:', err.message));
        }
    }

    /**
     * Récupère le brouillon actuel (en attente de review ou validé)
     */
    async getPendingDraft() {
        const acceptedRaw = await this.repo.getBotState('daily_msg_accepted_draft');
        if (acceptedRaw) {
            const draft = typeof acceptedRaw === 'string' ? JSON.parse(acceptedRaw) : acceptedRaw;
            return { ...draft, isAccepted: true };
        }

        const currentRaw = await this.repo.getBotState('daily_msg_current_draft');
        if (currentRaw) {
            const draft = typeof currentRaw === 'string' ? JSON.parse(currentRaw) : currentRaw;
            return { ...draft, isAccepted: false };
        }

        return null;
    }

    /**
     * Sauvegarde le brouillon en cours
     */
    async saveCurrentDraft(draft) {
        await this.repo.setBotState('daily_msg_current_draft', JSON.stringify(draft));
        return draft;
    }

    /**
     * Accepte et valide le brouillon en cours pour publication à 09:00
     */
    async acceptDraft(draftData = null) {
        let draft = draftData;
        if (!draft) {
            draft = await this.getPendingDraft();
        }
        if (!draft) {
            draft = await this.generateDailyMessageContent();
        }
        await this.repo.setBotState('daily_msg_accepted_draft', JSON.stringify(draft));
        await this.repo.setBotState('daily_msg_current_draft', null);
        return { ...draft, isAccepted: true };
    }

    /**
     * Refuse / Supprime le brouillon
     */
    async rejectDraft() {
        await this.repo.setBotState('daily_msg_accepted_draft', null);
        await this.repo.setBotState('daily_msg_current_draft', null);
        return true;
    }

    /**
     * Refuse et régénère immédiatement un nouveau brouillon
     */
    async regenerateDraft(date = null) {
        await this.rejectDraft();
        const newDraft = await this.generateDailyMessageContent(date);
        await this.saveCurrentDraft(newDraft);
        return newDraft;
    }

    async getStatus() {
        const lastPubDate = await this.repo.getLastPublishedDate();
        const conf = this.getConfig();
        const fullConfig = getConfig ? getConfig() : config;
        const recentMessages = await this.repo.getAiMessages('daily_message', 5);
        const pendingDraft = await this.getPendingDraft();
        const configuredModel = conf.ai_config?.model || fullConfig.openrouter?.default_model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

        return {
            enabled: conf.enabled !== false,
            channelId: conf.channel_id || null,
            previewChannelId: conf.preview_channel_id || null,
            configuredModel,
            lastPublishedDate: lastPubDate || null,
            isPublishedToday: lastPubDate === getParisDateString(new Date()),
            pendingDraft,
            recentMessages
        };
    }
}

Injectable()(DailyMessageService);
Cron('0 21 * * *', { timezone: 'Europe/Paris', configKey: 'scheduler.tasks.daily_preview' })(DailyMessageService.prototype, 'sendPreview');
Cron('0 9 * * *', { timezone: 'Europe/Paris', configKey: 'scheduler.tasks.daily_publish' })(DailyMessageService.prototype, 'publishScheduled');
Cron('0 11 * * *', { timezone: 'Europe/Paris', configKey: 'scheduler.tasks.daily_autovalidate' })(DailyMessageService.prototype, 'autoValidateAndPublish');

module.exports = {
    DailyMessageService
};
