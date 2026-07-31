const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { saveOpenAIMessage, getLastOpenAIMessageId, getTodayBirthdays, getGlobalStats, getPendingBumpReminders, markBumpReminderSent } = require('../database');
const { callResponseCustom } = require('./openrouter');
const { buildPrompt, requestPrompt, formatFinalPrompt } = require('../config/daily_message_config');

/**
 * Fonction de vérification et d'envoi des rappels de bump en attente
 */
async function checkAndSendBumpReminders(client) {
    try {
        const pendingBumps = await getPendingBumpReminders();
        for (const bump of pendingBumps) {
            try {
                const guild = await client.guilds.fetch(bump.guild_id);
                if (guild) {
                    const channel = await guild.channels.fetch(bump.channel_id);
                    if (channel) {
                        const userText = bump.username ? `@${bump.username}` : (bump.user_id ? `<@${bump.user_id}>` : null);
                        const userMentionInfo = userText ? ` (Dernier bump par ${userText})` : '';
                        await channel.send(`<@&1427703047534153872> **c'est l'heure de bumper Obsydian** <:Obsydemoncouverture:1488145689916473544> ${userMentionInfo}`);

                        const heureParis = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
                        console.log(`[BUMP] 2 heures se sont écoulées depuis le bump (ID: ${bump.id}), rappel envoyé à ${heureParis}!`);
                    }
                }
                await markBumpReminderSent(bump.id);
            } catch (err) {
                console.error(`❌ Erreur lors de l'envoi du rappel de bump (ID ${bump.id}):`, err);
                // Marquer comme envoyé pour éviter les boucles en cas d'erreur de canal inaccessible
                await markBumpReminderSent(bump.id);
            }
        }
    } catch (error) {
        console.error('❌ Erreur checkAndSendBumpReminders:', error);
    }
}

function setupScheduledTasks(client) {
    console.log('⏰ Configuration des tâches planifiées...');

    // 1. Vérification immédiate au démarrage du bot (reboot recovery)
    checkAndSendBumpReminders(client);

    // 2. Cron vérifiant toutes les minutes si un rappel de bump doit être envoyé
    cron.schedule('* * * * *', async () => {
        await checkAndSendBumpReminders(client);
    });

    // 3. Cron pour la génération quotidienne du message du jour à 09:00 (Paris)
    cron.schedule('0 9 * * *', async () => {
        try {
            console.log('🌅 Début de la génération du message du jour...');

            // ÉTAPE 1: Générer un prompt créatif via LLM
            console.log('🔄 Étape 1/2: Génération du prompt créatif...');
            const date = new Date();

            const promptGenerationOptions = {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                temperature: 1.2,
                maxTokens: 500
            };

            const metaPrompt = requestPrompt(date);
            const promptResponse = await callResponseCustom(metaPrompt, promptGenerationOptions);

            console.log('✅ Prompt généré:', promptResponse.text);

            const promptGenerationDb = {
                msgid: promptResponse.msgId,
                prompt: metaPrompt,
                instruction: promptGenerationOptions.systemPrompt || null,
                model: promptResponse.model,
                tokeninput: promptResponse.usage.promptTokens,
                tokenoutput: promptResponse.usage.completionTokens,
                content: promptResponse.text,
                type: 'prompt_generation'
            };
            await saveOpenAIMessage(promptGenerationDb);
            console.log('💾 Génération du prompt sauvegardée en base de données.');

            // ÉTAPE 2: Générer le message final avec le prompt
            console.log('🔄 Étape 2/2: Génération du message final...');

            const { prompt: finalPrompt, instruction: finalInstruction } = formatFinalPrompt(promptResponse.text, date);

            const messageOptions = {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                systemPrompt: finalInstruction,
                temperature: 0.8,
                maxTokens: 300
            };

            const messageResponse = await callResponseCustom(finalPrompt, messageOptions);

            console.log('✅ Message final généré:', messageResponse.text);

            const guildId = '1337543177086959657';
            const channelId = '1337807772024180756';

            const guild = await client.guilds.fetch(guildId, false);
            const channel = await guild.channels.fetch(channelId);

            const embed = new EmbedBuilder()
                .setColor('#F2C7CE')
                .setTitle('** Le message du jour **')
                .setDescription(messageResponse.text)
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            console.log('📤 Message envoyé sur Discord avec succès.');

            const messageDb = {
                msgid: messageResponse.msgId,
                prompt: finalPrompt,
                instruction: finalInstruction,
                model: messageResponse.model,
                tokeninput: messageResponse.usage.promptTokens,
                tokenoutput: messageResponse.usage.completionTokens,
                content: messageResponse.text,
                type: 'daily_message',
                previousMsgId: promptResponse.msgId
            };
            await saveOpenAIMessage(messageDb);
            console.log('💾 Message final sauvegardé en base de données.');

            console.log('🎉 Message du jour généré et envoyé avec succès !');

        } catch (error) {
            console.error('❌ Erreur lors de la génération du message du jour:', error.message);
            console.error('Stack:', error.stack);
        }
    }, {
        timezone: "Europe/Paris"
    });

    console.log('✅ Tâches planifiées configurées');
}

module.exports = {
    setupScheduledTasks,
    checkAndSendBumpReminders
};