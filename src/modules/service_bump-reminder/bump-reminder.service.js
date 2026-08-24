const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { BumpReminderRepository } = require('./bump-reminder.repository.js');
const { config, getConfig } = require('../../config/index.js');
const { toDateSafe } = require('../../utils/dateUtils.js');

class BumpReminderService {
    static inject = [BumpReminderRepository];

    constructor(repository) {
        this.repo = repository;
    }

    getConfig() {
        const currentConfig = getConfig ? getConfig() : config;
        const schedulerConf = currentConfig.scheduler || {};
        const taskConf = schedulerConf.tasks?.bump_reminders || {};
        return {
            enabled: schedulerConf.enabled !== false && taskConf.enabled !== false,
            role_id: taskConf.role_id || currentConfig.bump_reminders?.role_id,
            channel_id: taskConf.channel_id || currentConfig.bump_reminders?.channel_id,
            ...taskConf
        };
    }

    /**
     * Traite un message reçu du bot Disboard
     */
    async handleDisboardMessage(message) {
        const conf = this.getConfig();
        if (!conf.enabled) return;

        // Disboard Bot ID = '302050872383242240'
        if (!message.author.bot || message.author.id !== '302050872383242240') {
            return;
        }

        if (!message.embeds || message.embeds.length === 0) return;

        const targetPhrase = "Bump effectué !";
        for (const embed of message.embeds) {
            const textToSearch = `${embed.description || ''} ${embed.title || ''}`;
            if (textToSearch.includes(targetPhrase)) {

                let bumperId = null;
                let bumperUsername = null;

                if (message.interaction?.user) {
                    bumperId = message.interaction.user.id;
                    bumperUsername = message.interaction.user.username || message.interaction.user.globalName;
                } else if (message.interactionMetadata?.user) {
                    bumperId = message.interactionMetadata.user.id;
                    bumperUsername = message.interactionMetadata.user.globalName || message.interactionMetadata.user.username;
                }

                if (!bumperId) {
                    const mentionMatch = textToSearch.match(/<@!?(\d+)>/);
                    if (mentionMatch) {
                        bumperId = mentionMatch[1];
                        const fetchedUser = message.client.users.cache.get(bumperId);
                        if (fetchedUser) bumperUsername = fetchedUser.username;
                    } else if (message.mentions?.users?.size > 0) {
                        const firstUser = message.mentions.users.first();
                        bumperId = firstUser.id;
                        bumperUsername = firstUser.username;
                    }
                }

                const guildId = message.guild ? message.guild.id : 'unknown';
                const channelId = message.channel.id;

                const bump = await this.repo.saveBump(guildId, channelId, bumperId, bumperUsername);
                const nextReminderDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
                const userLabel = bumperUsername ? `@${bumperUsername}` : (bumperId ? `<@${bumperId}>` : 'Inconnu');

                console.log(`[BUMP] Bump détecté par ${userLabel}. Sauvegardé en BDD (ID: ${bump.id}). Rappel prévu pour : ${nextReminderDate}`);
            }
        }
    }

    /**
     * Vérifie et envoie les rappels de bump échus
     */
    async checkAndSendReminders(client) {
        const conf = this.getConfig();
        if (!conf.enabled) return;

        try {
            const pendingList = await this.repo.getPendingReminders();
            if (!pendingList || pendingList.length === 0) return;

            const now = Date.now();

            for (const bump of pendingList) {
                const bumpDate = toDateSafe(bump.bumped_at);
                if (!bumpDate) continue;

                // 2 heures en millisecondes = 7 200 000 ms
                const targetTimestamp = bumpDate.getTime() + (2 * 60 * 60 * 1000);
                const remainingMs = targetTimestamp - now;

                // Si l'heure de rappel est arrivée ou dépassée
                if (remainingMs <= 0) {
                    await this.sendBumpReminder(client, bump);
                }
            }
        } catch (error) {
            console.error('❌ [BUMP Service] Erreur checkAndSendReminders:', error);
        }
    }

    /**
     * Envoie l'embed de rappel dans le salon approprié
     */
    async sendBumpReminder(client, bump) {
        const conf = this.getConfig();
        const channelId = conf.channel_id || bump.channel_id;

        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) return;

            const roleMention = conf.role_id ? `<@&${conf.role_id}>` : '@here';

            const embed = new EmbedBuilder()
                .setColor('#f2c7ce')
                .setTitle('⏰ C\'est l\'heure du Bump !')
                .setDescription(
                    `2 heures se sont écoulées depuis le dernier bump !\n\n` +
                    `Tapez </bump:947088344167366698> pour faire monter le serveur sur Disboard 🚀`
                )
                .setTimestamp();

            await channel.send({
                content: `🔔 ${roleMention}`,
                embeds: [embed]
            });

            await this.repo.markReminderSent(bump.id);
            const dateStr = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
            console.log(`[BUMP] 2 heures se sont écoulées, rappel envoyé à ${dateStr} (Bump ID: ${bump.id}) !`);

        } catch (error) {
            console.error(`❌ [BUMP Service] Erreur envoi rappel (Bump ID: ${bump.id}):`, error);
        }
    }

    /**
     * Retourne l'état actuel du prochain bump pour l'API / Dashboard
     */
    async getBumpStatus(guildId = null) {
        const lastBump = await this.repo.getLastBump(guildId);
        const history = await this.repo.getHistory(10);
        const conf = this.getConfig();

        if (!lastBump) {
            return {
                enabled: conf.enabled,
                hasBump: false,
                message: 'Aucun bump enregistré pour le moment.',
                history
            };
        }

        const now = Date.now();
        const bumpDate = toDateSafe(lastBump.bumped_at);
        const targetTimestamp = bumpDate ? bumpDate.getTime() + (2 * 60 * 60 * 1000) : now;
        const remainingSeconds = Math.max(0, Math.floor((targetTimestamp - now) / 1000));
        const isReady = remainingSeconds <= 0;

        return {
            enabled: conf.enabled,
            hasBump: true,
            lastBump: {
                id: lastBump.id,
                bumperId: lastBump.bumper_id,
                bumperUsername: lastBump.bumper_username,
                bumpedAt: lastBump.bumped_at,
                reminderSent: lastBump.reminder_sent === 1
            },
            isReady,
            remainingSeconds,
            history
        };
    }
}

Injectable()(BumpReminderService);

module.exports = {
    BumpReminderService
};
