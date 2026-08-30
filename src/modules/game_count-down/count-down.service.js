const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { CountDownRepository } = require('./count-down.repository.js');
const { config, getConfig } = require('../../config/index.js');

class CountDownService {
    static inject = [CountDownRepository];

    constructor (repository) {
        this.repo = repository;
    }

    getConfig() {
        const currentConfig = getConfig ? getConfig() : config;
        return currentConfig.countdown || {};
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
     * Initialise le canal CountDown au démarrage si aucun état n'existe
     * @param {import('discord.js').Client} client
     */
    async initCountdownChannel(client) {
        const cdConfig = this.getConfig();
        if (cdConfig.enabled === false) return;

        const COUNTDOWN_CHANNEL_ID = cdConfig.channel_id || '1533492760697503805';
        const COUNTDOWN_START_AT = cdConfig.start_number || 900;
        const messages = cdConfig.messages || {};

        try {
            let state = await this.repo.getState(COUNTDOWN_CHANNEL_ID);
            if (!state) {
                const channel = await client.channels.fetch(COUNTDOWN_CHANNEL_ID).catch(() => null);
                if (channel) {
                    await this.repo.updateState(COUNTDOWN_CHANNEL_ID, COUNTDOWN_START_AT, 0, null, null);
                    const text = this.formatMessage(
                        messages.start_message || "**Allez, je commence :** {number}",
                        { number: COUNTDOWN_START_AT }
                    );
                    await channel.send(text);
                    console.log(`✅ [COUNTDOWN] Salon initialisé : "${text}" envoyé.`);
                }
            }
        } catch (error) {
            console.error('❌ [COUNTDOWN Service] Erreur initCountdownChannel:', error);
        }
    }

    /**
     * Traite un message reçu dans le canal du CountDown
     * @param {import('discord.js').Message} message
     */
    async handleIncomingMessage(message) {
        const cdConfig = this.getConfig();
        if (cdConfig.enabled === false) return;

        const COUNTDOWN_CHANNEL_ID = cdConfig.channel_id || '1533492760697503805';
        const COUNTDOWN_START_AT = cdConfig.start_number || 900;
        const trapChance = cdConfig.trap_chance !== undefined ? cdConfig.trap_chance : 0.15;
        const emojis = cdConfig.emojis || {};
        const EMOJI_OBSYBON_ID = emojis.obsybon_id || '1524104068514189422';
        const EMOJI_OBSYDEMON_ID = emojis.obsydemon_id || '1488145689916473544';
        const messages = cdConfig.messages || {};

        if (message.channel.id !== COUNTDOWN_CHANNEL_ID || message.author.bot) {
            return;
        }

        try {
            let state = await this.repo.getState(COUNTDOWN_CHANNEL_ID);

            if (!state) {
                state = await this.repo.updateState(COUNTDOWN_CHANNEL_ID, COUNTDOWN_START_AT, 0, null, null);
                const text = this.formatMessage(
                    messages.start_message || "**Allez, je commence :** {number}",
                    { number: COUNTDOWN_START_AT }
                );
                await message.channel.send(text);
                console.log(`✅ [COUNTDOWN] Initialisé à ${COUNTDOWN_START_AT} en BDD.`);
            }

            // 1. Vérification : Pas deux nombres consécutifs
            if (state.last_user_id === message.author.id) {
                try {
                    const obsyDemonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYDEMON_ID) || EMOJI_OBSYDEMON_ID;
                    await message.react(obsyDemonEmoji);
                } catch {
                    await message.react('❌').catch(err => {
                        console.warn('[COUNTDOWN] Impossible de réagir au message:', err.message);
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
                console.log(`⚠️ [COUNTDOWN] ${message.author.tag} a essayé de poster deux fois d'affilée.`);
                return;
            }

            const contentText = message.content.trim();
            const isNumberFormat = /^\d+$/.test(contentText);
            const postedNumber = isNumberFormat ? parseInt(contentText, 10) : null;

            // 2. Piège actif
            if (state.is_trap_active === 1) {
                const trapNum = state.trap_number;

                if (postedNumber !== null && postedNumber === trapNum) {
                    // 🎉 Esquivé !
                    try {
                        const obsybonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYBON_ID) || EMOJI_OBSYBON_ID;
                        await message.react(obsybonEmoji);
                    } catch {
                        await message.react('✅').catch(err => {
                            console.warn('[COUNTDOWN] Impossible de réagir au message:', err.message);
                        });
                    }

                    const dodgeMsg = this.formatMessage(
                        messages.trap_dodge_message || "**J’ai cru que j’allais vous avoir**",
                        {
                            userId: message.author.id,
                            username: message.author.username,
                            emojiObsydemon: EMOJI_OBSYDEMON_ID
                        }
                    );
                    await message.channel.send(dodgeMsg);

                    await this.repo.addScore(COUNTDOWN_CHANNEL_ID, message.author.id, message.author.username);
                    await this.repo.updateState(COUNTDOWN_CHANNEL_ID, trapNum, 0, null, message.author.id);

                    console.log(`🛡️ [COUNTDOWN] ${message.author.tag} a esquivé le piège (${trapNum}) !`);
                    return;

                } else {
                    // ❌ Tombé dans le piège !
                    try {
                        const obsydemoEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYDEMON_ID) || EMOJI_OBSYDEMON_ID;
                        await message.react(obsydemoEmoji);
                    } catch {
                        await message.react('❌').catch(err => {
                            console.warn('[COUNTDOWN] Impossible de réagir au message:', err.message);
                        });
                    }

                    const maxErrors = Math.max(1, parseInt(cdConfig.max_errors || 1, 10));
                    const newErrorCount = (state.error_count || 0) + 1;

                    if (newErrorCount < maxErrors) {
                        await this.repo.updateState(COUNTDOWN_CHANNEL_ID, currentNumber, 0, null, state.last_user_id, newErrorCount);

                        const trapFailMsg = this.formatMessage(
                            messages.trap_failed_message || "<@{userId}>**, Je t’ai eu !** (**{errorsCount}/{maxErrors} erreurs** tolérées). Le prochain nombre attendu est **{expectedNumber}**.",
                            {
                                userId: message.author.id,
                                username: message.author.username,
                                errorsCount: newErrorCount,
                                maxErrors,
                                remainingErrors: maxErrors - newErrorCount,
                                expectedNumber: currentNumber - 1,
                                emojiObsydemon: EMOJI_OBSYDEMON_ID
                            }
                        );
                        await message.channel.send(trapFailMsg);
                        console.log(`🪤 [COUNTDOWN] ${message.author.tag} est tombé dans le piège (${newErrorCount}/${maxErrors} erreurs)`);
                        return;
                    }

                    // Seuil d'erreurs atteint lors du piège -> Reset de la partie
                    await this.handleGameOver(message, COUNTDOWN_CHANNEL_ID, COUNTDOWN_START_AT, messages, newErrorCount, maxErrors);
                    return;
                }
            }

            // 3. Déroulement normal
            const currentNumber = state.current_number;
            const expectedNumber = currentNumber - 1;

            if (postedNumber !== null && postedNumber === expectedNumber) {
                // ✅ Nombre correct
                try {
                    const obsybonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYBON_ID) || EMOJI_OBSYBON_ID;
                    await message.react(obsybonEmoji);
                } catch {
                    await message.react('✅').catch(err => {
                        console.warn('[COUNTDOWN] Impossible de réagir au message:', err.message);
                    });
                }

                await this.repo.addScore(COUNTDOWN_CHANNEL_ID, message.author.id, message.author.username);
                console.log(`🔢 [COUNTDOWN] ${message.author.tag} a validé le nombre ${expectedNumber}`);

                // 4. Arrivée à 0 : Victoire & Réinitialisation
                if (expectedNumber === 0) {
                    const finishMsg = this.formatMessage(
                        messages.finish_message || "**Je suis émue, vous ne vous êtes pas trompés mais ce n’est pas fini.**",
                        {
                            userId: message.author.id,
                            username: message.author.username,
                            emojiObsydemon: EMOJI_OBSYDEMON_ID
                        }
                    );
                    await message.channel.send(finishMsg);

                    const scores = await this.repo.getScores(COUNTDOWN_CHANNEL_ID);
                    let rankingText = messages.no_participation || "Aucune participation enregistrée.";
                    if (scores.length > 0) {
                        rankingText = scores.map((s, index) => {
                            const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '👤'));
                            return `${medal} **${s.username}** : ${s.score} point(s)`;
                        }).join('\n');
                    }

                    const embed = new EmbedBuilder()
                        .setColor(messages.embed_color || '#F2C7CE')
                        .setTitle(messages.embed_title || '🏆 **Classement de la partie**')
                        .setDescription(rankingText)
                        .setTimestamp();

                    await message.channel.send({ embeds: [embed] });

                    await this.repo.resetScores(COUNTDOWN_CHANNEL_ID);
                    await this.repo.updateState(COUNTDOWN_CHANNEL_ID, COUNTDOWN_START_AT, 0, null, null, 0);

                    const restartMsg = this.formatMessage(
                        messages.start_message || "**Allez, je commence :** {number}",
                        { number: COUNTDOWN_START_AT }
                    );
                    await message.channel.send(restartMsg);
                    return;
                }

                // 5. Tirage aléatoire d'un piège
                const shouldTrap = (expectedNumber > 5 && expectedNumber < 85) && (Math.random() < trapChance);

                if (shouldTrap) {
                    const trapNumber = expectedNumber - 1;
                    console.log(`🪤 [COUNTDOWN] Piège déclenché par le bot ! Nombre posté : ${trapNumber}`);

                    await message.channel.send(`${trapNumber}`);
                    await this.repo.updateState(COUNTDOWN_CHANNEL_ID, trapNumber, 1, trapNumber, message.author.id, state.error_count || 0);
                } else {
                    await this.repo.updateState(COUNTDOWN_CHANNEL_ID, expectedNumber, 0, null, message.author.id, state.error_count || 0);
                }

            } else {
                // ❌ Nombre incorrect
                try {
                    const obsydemoEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYDEMON_ID) || EMOJI_OBSYDEMON_ID;
                    await message.react(obsydemoEmoji);
                } catch {
                    await message.react('❌').catch(err => {
                        console.warn('[COUNTDOWN] Impossible de réagir au message:', err.message);
                    });
                }

                const maxErrors = Math.max(1, parseInt(cdConfig.max_errors || 1, 10));
                const newErrorCount = (state.error_count || 0) + 1;

                if (newErrorCount < maxErrors) {
                    await this.repo.updateState(COUNTDOWN_CHANNEL_ID, currentNumber, 0, null, state.last_user_id, newErrorCount);

                    const warningMsg = this.formatMessage(
                        messages.warning_message || messages.error_message || "⚠️ <@{userId}> s'est trompé(e) ! (**{errorsCount}/{maxErrors} erreurs** tolérées). Le prochain nombre attendu est **{expectedNumber}**.",
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
                    console.log(`⚠️ [COUNTDOWN] ${message.author.tag} a fait une erreur (${newErrorCount}/${maxErrors} erreurs). Décompte maintenu à ${currentNumber}.`);
                    return;
                }

                // Seuil d'erreurs atteint -> Reset de la partie
                await this.handleGameOver(message, COUNTDOWN_CHANNEL_ID, COUNTDOWN_START_AT, messages, newErrorCount, maxErrors);
            }

        } catch (error) {
            console.error('❌ [COUNTDOWN Service] Erreur:', error);
        }
    }

    async handleGameOver(message, channelId, startNumber, messages, errorsCount, maxErrors) {
        const scores = await this.repo.getScores(channelId);
        let rankingText = messages.no_participation || "Aucune participation enregistrée.";
        if (scores.length > 0) {
            rankingText = scores.map((s, index) => {
                const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '👤'));
                return `${medal} **${s.username}** : ${s.score} point(s)`;
            }).join('\n');
        }

        const embed = new EmbedBuilder()
            .setColor(messages.embed_color || '#F2C7CE')
            .setTitle(messages.embed_title || '❌ **Partie terminée !**')
            .setDescription(`**La limite de ${maxErrors} erreur(s) a été atteinte.**\n\n🏆 **Classement de la partie :**\n${rankingText}\n\nLe compte à rebours a été réinitialisé à **${startNumber}**.`)
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });

        await this.repo.resetScores(channelId);
        await this.repo.updateState(channelId, startNumber, 0, null, null, 0);

        const restartMsg = this.formatMessage(
            messages.start_message || "**Allez, je commence :** {number}",
            { number: startNumber }
        );
        await message.channel.send(restartMsg);
        console.log(`❌ [COUNTDOWN] ${message.author.tag} a atteint la limite d'erreurs (${errorsCount}/${maxErrors}). Partie réinitialisée.`);
    }

    async getGameState(channelId = null) {
        const targetChannel = channelId || this.getConfig().channel_id || '1533492760697503805';
        const state = await this.repo.getState(targetChannel);
        return {
            channelId: targetChannel,
            currentNumber: state?.current_number ?? (this.getConfig().start_number || 900),
            errorCount: state?.error_count || 0,
            maxErrors: this.getConfig().max_errors || 1,
            isTrapActive: state?.is_trap_active === 1,
            trapNumber: state?.trap_number || null,
            lastUserId: state?.last_user_id || null,
            updatedAt: state?.updated_at || null,
            enabled: this.getConfig().enabled !== false
        };
    }

    async getLeaderboard(channelId = null, limit = 10) {
        const targetChannel = channelId || this.getConfig().channel_id || '1533492760697503805';
        const scores = await this.repo.getScores(targetChannel, limit);
        return scores;
    }

    async resetGame(channelId = null) {
        const targetChannel = channelId || this.getConfig().channel_id || '1533492760697503805';
        const startNumber = this.getConfig().start_number || 900;
        await this.repo.resetScores(targetChannel);
        await this.repo.updateState(targetChannel, startNumber, 0, null, null, 0);
        return { success: true, message: `Compte à rebours réinitialisé à ${startNumber}.` };
    }
}

Injectable()(CountDownService);

module.exports = {
    CountDownService
};
