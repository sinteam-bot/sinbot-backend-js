const { EmbedBuilder } = require('discord.js');
const { Injectable, Cron } = require('../../core/index.js');
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
        const bumpConf = currentConfig.bump_reminders || {};
        return {
            enabled: schedulerConf.enabled !== false && taskConf.enabled !== false && bumpConf.enabled !== false,
            role_id: bumpConf.role_id || taskConf.role_id || '',
            channel_id: bumpConf.channel_id || taskConf.channel_id || '',
            reminder_cooldown_hours: bumpConf.reminder_cooldown_hours || 2,
            mention_here: bumpConf.mention_here !== false,
            messages: {
                title: bumpConf.messages?.title || "⏰ C'est l'heure du Bump !",
                description: bumpConf.messages?.description || "2 heures se sont écoulées depuis le dernier bump !\n\nTapez </bump:947088344167366698> pour faire monter le serveur sur Disboard 🚀",
                color: bumpConf.messages?.color || bumpConf.color || "#f2c7ce"
            },
            ...taskConf,
            ...bumpConf
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
                const cooldownHours = Number(conf.reminder_cooldown_hours) || 2;
                const nextReminderDate = new Date(Date.now() + cooldownHours * 60 * 60 * 1000).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
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

            // pendingList est trié par id DESC (le plus récent en premier)
            const latestBump = pendingList[0];

            // Marquer tous les anciens bumps non rappelés comme traités pour éviter le spam
            if (pendingList.length > 1) {
                for (let i = 1; i < pendingList.length; i++) {
                    await this.repo.markReminderSent(pendingList[i].id);
                }
            }

            const now = Date.now();
            const bumpDate = toDateSafe(latestBump.bumped_at);
            if (!bumpDate) {
                await this.repo.markReminderSent(latestBump.id);
                return;
            }

            const cooldownHours = Number(conf.reminder_cooldown_hours) || 2;
            const targetTimestamp = bumpDate.getTime() + (cooldownHours * 60 * 60 * 1000);
            const remainingMs = targetTimestamp - now;

            // Si le rappel est dû
            if (remainingMs <= 0) {
                // Si le bump est trop ancien (> 24h), on l'acquitte sans spammer
                const isTooOld = (now - targetTimestamp) > (24 * 60 * 60 * 1000);
                if (isTooOld) {
                    await this.repo.markReminderSent(latestBump.id);
                    return;
                }

                await this.sendBumpReminder(client, latestBump);
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

        if (!channelId || !/^\d{17,20}$/.test(channelId)) {
            console.warn(`⚠️ [BUMP Service] ID de salon invalide ignoré (Bump ID: ${bump.id}, salon: "${channelId}")`);
            await this.repo.markReminderSent(bump.id);
            return;
        }

        try {
            const channel = await client.channels.fetch(channelId).catch(err => {
                console.warn(`⚠️ [BUMP Service] Impossible de récupérer le salon ${channelId}:`, err.message);
                return null;
            });
            if (!channel || !channel.isTextBased()) {
                await this.repo.markReminderSent(bump.id);
                return;
            }

            const roleMention = conf.role_id ? `<@&${conf.role_id}>` : (conf.mention_here !== false ? '@here' : '');
            const title = conf.messages?.title || "⏰ C'est l'heure du Bump !";
            const description = conf.messages?.description || "2 heures se sont écoulées depuis le dernier bump !\n\nTapez </bump:947088344167366698> pour faire monter le serveur sur Disboard 🚀";
            const color = conf.messages?.color || conf.color || '#f2c7ce';

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(description)
                .setTimestamp();

            await channel.send({
                content: roleMention ? `🔔 ${roleMention}` : undefined,
                embeds: [embed]
            });

            await this.repo.markReminderSent(bump.id);
            const dateStr = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
            console.log(`[BUMP] 2 heures se sont écoulées, rappel envoyé à ${dateStr} (Bump ID: ${bump.id}) !`);

        } catch (error) {
            console.error(`❌ [BUMP Service] Erreur envoi rappel (Bump ID: ${bump.id}):`, error);
            if (error.code === 50035 || error.code === 10003 || error.status === 400 || error.status === 404) {
                await this.repo.markReminderSent(bump.id);
            }
        }
    }

    /**
     * Retourne l'état actuel du prochain bump pour l'API / Dashboard
     */
    async getBumpStatus(guildId = null) {
        const lastBump = await this.repo.getLastBump(guildId);
        const history = await this.repo.getHistory(20);
        const conf = this.getConfig();

        const cooldownHours = Number(conf.reminder_cooldown_hours) || 2;

        if (!lastBump) {
            return {
                enabled: conf.enabled,
                hasBump: false,
                config: conf,
                message: 'Aucun bump enregistré pour le moment.',
                history
            };
        }

        const now = Date.now();
        const bumpDate = toDateSafe(lastBump.bumped_at);
        const targetTimestamp = bumpDate ? bumpDate.getTime() + (cooldownHours * 60 * 60 * 1000) : now;
        const remainingSeconds = Math.max(0, Math.floor((targetTimestamp - now) / 1000));
        const isReady = remainingSeconds <= 0;

        return {
            enabled: conf.enabled,
            hasBump: true,
            config: conf,
            lastBump: {
                id: lastBump.id,
                channelId: lastBump.channel_id,
                bumperId: lastBump.bumper_id,
                bumperUsername: lastBump.bumper_username,
                bumpedAt: lastBump.bumped_at,
                reminderSent: lastBump.reminder_sent === 1
            },
            isReady,
            remainingSeconds,
            targetTimestamp,
            history
        };
    }
}

Injectable()(BumpReminderService);
Cron('* * * * *', { timezone: 'Europe/Paris', configKey: 'scheduler.tasks.bump_reminders' })(BumpReminderService.prototype, 'checkAndSendReminders');

module.exports = {
    BumpReminderService
};
