const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { RoadToInfiniteRepository } = require('./road-to-infinite.repository.js');
const { config, getConfig } = require('../../config/index.js');

class RoadToInfiniteService {
    static inject = [RoadToInfiniteRepository];

    constructor (repository) {
        this.repo = repository;
    }

    getConfig() {
        const currentConfig = getConfig ? getConfig() : config;
        return currentConfig.counter || {};
    }

    formatMessage(template, replacements = {}) {
        if (!template) return '';
        let res = template;
        for (const [key, val] of Object.entries(replacements)) {
            res = res.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
        }
        return res;
    }

    /**
     * Traite un message reçu dans le canal de la Route de l'Infini
     * @param {import('discord.js').Message} message
     */
    async handleIncomingMessage(message) {
        const counterConfig = this.getConfig();
        if (counterConfig.enabled === false) return;

        const COUNTER_CHANNEL_ID = counterConfig.channel_id || '1533492692825276598';
        const emojis = counterConfig.emojis || {};
        const EMOJI_OBSYBON_ID = emojis.obsybon_id || '1524104068514189422';
        const EMOJI_OBSYDEMON_ID = emojis.obsydemon_id || '1488145689916473544';
        const messages = counterConfig.messages || {};

        if (message.channel.id !== COUNTER_CHANNEL_ID || message.author.bot) {
            return;
        }

        try {
            let state = await this.repo.getState(COUNTER_CHANNEL_ID);

            // Auto-initialisation si l'état n'existe pas en BDD
            if (!state) {
                console.log('🔄 [COUNTER] Initialisation automatique du compteur à partir de l\'historique...');
                let lastValidNum = 0;
                let lastUserId = null;

                const fetchedMessages = await message.channel.messages.fetch({ limit: 30 });
                const sortedMessages = Array.from(fetchedMessages.values())
                    .filter(m => m.id !== message.id && !m.author.bot)
                    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

                for (const msg of sortedMessages) {
                    const text = msg.content.trim();
                    if (/^\d+$/.test(text)) {
                        lastValidNum = parseInt(text, 10);
                        lastUserId = msg.author.id;
                    }
                }

                state = await this.repo.updateState(COUNTER_CHANNEL_ID, lastValidNum, lastUserId);
                console.log(`✅ [COUNTER] Compteur initialisé au nombre: ${lastValidNum}`);
            }

            // 1. Vérification : Pas deux nombres consécutifs par le même utilisateur
            if (state.last_user_id === message.author.id) {
                try {
                    const obsyDemonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYDEMON_ID) || EMOJI_OBSYDEMON_ID;
                    await message.react(obsyDemonEmoji);
                } catch {
                    await message.react('❌').catch(err => {
                        console.warn('[COUNTER] Impossible de réagir au message:', err.message);
                    });
                }

                const doublePostMsg = this.formatMessage(
                    messages.double_post_message || "<@{userId}>, **vous ne pouvez pas partager deux nombres à la suite**",
                    {
                        userId: message.author.id,
                        username: message.author.username,
                        emojiObsydemon: EMOJI_OBSYDEMON_ID
                    }
                );

                await message.channel.send(doublePostMsg);
                console.log(`⚠️ [COUNTER] ${message.author.tag} a essayé de poster deux fois d'affilée.`);
                return;
            }

            const currentNumber = state.current_number || 0;
            const expectedNumber = currentNumber + 1;

            const contentText = message.content.trim();
            const isNumberFormat = /^\d+$/.test(contentText);
            const postedNumber = isNumberFormat ? parseInt(contentText, 10) : null;

            // 2. Vérification si le nombre est correct
            if (postedNumber !== null && postedNumber === expectedNumber) {
                await this.repo.updateState(COUNTER_CHANNEL_ID, expectedNumber, message.author.id, state.error_count || 0);
                await this.repo.addScore(COUNTER_CHANNEL_ID, message.author.id, message.author.username);

                try {
                    const obsybonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYBON_ID) || EMOJI_OBSYBON_ID;
                    await message.react(obsybonEmoji);
                } catch {
                    await message.react('✅').catch(err => {
                        console.warn('[COUNTER] Impossible de réagir au message:', err.message);
                    });
                }

                console.log(`🔢 [COUNTER] ${message.author.tag} a validé le nombre ${expectedNumber}`);

            } else {
                // ❌ Erreur : Nombre incorrect
                try {
                    const obsyDemonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYDEMON_ID) || EMOJI_OBSYDEMON_ID;
                    await message.react(obsyDemonEmoji);
                } catch {
                    await message.react('❌').catch(err => {
                        console.warn('[COUNTER] Impossible de réagir au message:', err.message);
                    });
                }

                const maxErrors = Math.max(1, parseInt(counterConfig.max_errors || 1, 10));
                const newErrorCount = (state.error_count || 0) + 1;

                if (newErrorCount < maxErrors) {
                    await this.repo.updateState(COUNTER_CHANNEL_ID, currentNumber, state.last_user_id, newErrorCount);

                    const warningMsg = this.formatMessage(
                        messages.warning_message || "⚠️ <@{userId}> s'est trompé(e) ! (**{errorsCount}/{maxErrors} erreurs** tolérées). Le nombre attendu reste **{expectedNumber}**.",
                        {
                            userId: message.author.id,
                            username: message.author.username,
                            errorsCount: newErrorCount,
                            maxErrors,
                            remainingErrors: maxErrors - newErrorCount,
                            expectedNumber,
                            postedNumber: message.content,
                            emojiObsydemon: EMOJI_OBSYDEMON_ID
                        }
                    );

                    await message.channel.send(warningMsg);
                    console.log(`⚠️ [COUNTER] ${message.author.tag} a fait une erreur (${newErrorCount}/${maxErrors} erreurs). Compteur maintenu à ${currentNumber}.`);
                    return;
                }

                // Si le seuil d'erreurs est atteint : Game Over & Réinitialisation
                const scores = await this.repo.getScores(COUNTER_CHANNEL_ID);

                let rankingText = messages.no_participation || "Aucune participation enregistrée pour cette session.";
                if (scores.length > 0) {
                    rankingText = scores.map((s, index) => {
                        const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '👤'));
                        return `${medal} **${s.username}** : ${s.score} point(s)`;
                    }).join('\n');
                }

                const rankingTextHeader = this.formatMessage(
                    messages.ranking_header || "**<@{userId}> a ruiné la Route de l'Infini après {maxErrors} erreur(s) !** \n\n 🏆 **Classement de la Route de l'Infini**\n",
                    {
                        userId: message.author.id,
                        username: message.author.username,
                        expectedNumber,
                        postedNumber: message.content,
                        errorsCount: newErrorCount,
                        maxErrors
                    }
                );

                const rankingTextFooter = messages.ranking_footer || "\n\nLe compteur a été réinitialisé, le prochain nombre est 1.";

                const embed = new EmbedBuilder()
                    .setColor(messages.embed_color || '#F2C7CE')
                    .setTitle(messages.embed_title || '❌ Perdu !')
                    .setDescription(rankingTextHeader + rankingText + rankingTextFooter)
                    .setTimestamp();

                await message.channel.send({ embeds: [embed] });

                await this.repo.resetScores(COUNTER_CHANNEL_ID);
                await this.repo.updateState(COUNTER_CHANNEL_ID, 0, null, 0);

                console.log(`❌ [COUNTER] ${message.author.tag} a atteint la limite d'erreurs (${newErrorCount}/${maxErrors}). Compteur réinitialisé.`);
            }

        } catch (error) {
            console.error('❌ [COUNTER Service] Erreur:', error);
        }
    }

    async getGameState(channelId = null) {
        const targetChannel = channelId || this.getConfig().channel_id || '1533492692825276598';
        const state = await this.repo.getState(targetChannel);
        return {
            channelId: targetChannel,
            currentNumber: state?.current_number || 0,
            errorCount: state?.error_count || 0,
            maxErrors: this.getConfig().max_errors || 1,
            lastUserId: state?.last_user_id || null,
            updatedAt: state?.updated_at || null,
            enabled: this.getConfig().enabled !== false
        };
    }

    async getLeaderboard(channelId = null, limit = 10) {
        const targetChannel = channelId || this.getConfig().channel_id || '1533492692825276598';
        const scores = await this.repo.getScores(targetChannel, limit);
        return scores;
    }

    async resetGame(channelId = null) {
        const targetChannel = channelId || this.getConfig().channel_id || '1533492692825276598';
        await this.repo.resetScores(targetChannel);
        await this.repo.updateState(targetChannel, 0, null, 0);
        return { success: true, message: 'Compteur réinitialisé avec succès.' };
    }
}

Injectable()(RoadToInfiniteService);

module.exports = {
    RoadToInfiniteService
};
