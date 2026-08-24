const cron = require('node-cron');
const { getPendingBumpReminders, markBumpReminderSent } = require("../database.js");
const { 
    sendDailyMessagePreview, 
    publishScheduledDailyMessage, 
    autoValidateAndPublishDailyMessage,
    getParisHour 
} = require("./dailyMessageManager.js");
const { toDateSafe } = require("./dateUtils.js");
const { config } = require("../config/index.js");

// Cache mémoire des rappels de bump actuellement planifiés par setTimeout
const activeScheduledBumpIds = new Set();

/**
 * Fonction de vérification et d'envoi des rappels de bump en attente
 */
async function checkAndSendBumpReminders(client) {
    try {
        const pendingBumps = await getPendingBumpReminders();
        const now = Date.now();

        for (const bump of pendingBumps) {
            if (activeScheduledBumpIds.has(bump.id)) {
                continue; // Déjà planifié en mémoire pour s'exécuter dans quelques secondes
            }

            try {
                const bumpDate = toDateSafe(bump.bumped_at);
                if (!bumpDate) {
                    console.warn(`[BUMP] Date de bump invalide pour l'ID ${bump.id} (${bump.bumped_at}), bump ignoré.`);
                    await markBumpReminderSent(bump.id);
                    continue;
                }

                // 2 heures en millisecondes = 7 200 000 ms
                const targetTimestamp = bumpDate.getTime() + (2 * 60 * 60 * 1000);
                const remainingMs = targetTimestamp - now;

                const sendReminderNow = async () => {
                    try {
                        const guild = await client.guilds.fetch(bump.guild_id);
                        if (guild) {
                            const channel = await guild.channels.fetch(bump.channel_id);
                            if (channel) {
                                const userText = bump.username ? `@${bump.username}` : (bump.user_id ? `<@${bump.user_id}>` : null);
                                const userMentionInfo = userText ? ` (Dernier bump par <@${bump.user_id}>)` : '';
                                await channel.send(`<@&1427703047534153872> **c'est l'heure de bumper Obsydian** <:Obsydemoncouverture:1488145689916473544> ${userMentionInfo}`);
                                const heureParis = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
                                console.log(`[BUMP] 2 heures se sont écoulées, le rappel a été envoyé à ${heureParis} (Bump ID: ${bump.id}) !`);
                            }
                        }
                    } catch (err) {
                        console.error(`❌ Erreur lors de l'envoi du message de rappel de bump (ID ${bump.id}):`, err.message);
                    } finally {
                        activeScheduledBumpIds.delete(bump.id);
                        await markBumpReminderSent(bump.id);
                    }
                };

                // Cas 1 : 2 heures ou plus se sont déjà écoulées (ex: redémarrage après l'heure)
                if (remainingMs <= 0) {
                    await sendReminderNow();
                }
                // Cas 2 : Moins d'une minute restante avant l'échéance des 2 heures
                else if (remainingMs <= 60 * 1000) {
                    activeScheduledBumpIds.add(bump.id);
                    console.log(`[BUMP] Bientôt 2 heures écoulées depuis le bump (ID: ${bump.id}), envoi dans ${Math.ceil(remainingMs / 1000)}s.`);
                    setTimeout(sendReminderNow, remainingMs);
                }
                // Cas 3 : Plus d'une minute restante, la prochaine exécution du cron s'en chargera
                else {
                    // On laisse le cron périodique (chaque minute) s'en occuper
                }
            } catch (err) {
                console.error(`❌ Erreur lors du traitement du rappel de bump (ID ${bump.id}):`, err);
                activeScheduledBumpIds.delete(bump.id);
                await markBumpReminderSent(bump.id);
            }
        }
    } catch (error) {
        console.error('❌ Erreur checkAndSendBumpReminders:', error);
    }
}

function setupScheduledTasks(client) {
    const schedulerConfig = config.scheduler || { enabled: true, timezone: 'Europe/Paris', tasks: {} };
    
    if (schedulerConfig.enabled === false) {
        console.log('⏸️ [Scheduler] Le planificateur de tâches est désactivé dans la configuration.');
        return;
    }

    const timezone = schedulerConfig.timezone || 'Europe/Paris';
    const tasks = schedulerConfig.tasks || {};

    console.log(`⏰ Configuration des tâches planifiées (Fuseau: ${timezone})...`);

    // 1. Vérification immédiate au démarrage du bot (reboot recovery)
    const bumpTask = tasks.bump_reminders ?? { enabled: true, cron: '* * * * *' };
    if (bumpTask.enabled) {
        checkAndSendBumpReminders(client);
    }

    const currentHour = getParisHour();
    const isDailyMessageEnabled = config.daily_message?.enabled !== false;
    const autoValidateTask = tasks.daily_autovalidate ?? { enabled: true, cron: '0 11 * * *' };
    const publishTask = tasks.daily_publish ?? { enabled: true, cron: '0 9 * * *' };
    const previewTask = tasks.daily_preview ?? { enabled: true, cron: '0 21 * * *' };

    if (isDailyMessageEnabled) {
        if (autoValidateTask.enabled && currentHour >= 11) {
            autoValidateAndPublishDailyMessage(client);
        } else if (publishTask.enabled && currentHour >= 9) {
            publishScheduledDailyMessage(client);
        }
    }

    // 2. Cron vérifiant toutes les minutes si un rappel de bump doit être envoyé
    if (bumpTask.enabled) {
        const cronExpr = bumpTask.cron || '* * * * *';
        cron.schedule(cronExpr, async () => {
            await checkAndSendBumpReminders(client);
        });
        console.log(`   └─ 🔔 Bump Reminders: actif (${cronExpr})`);
    }

    // 3. Cron pour la génération et prévisualisation du message du jour à 21:00 (Paris, la veille)
    if (isDailyMessageEnabled && previewTask.enabled) {
        const cronExpr = previewTask.cron || '0 21 * * *';
        cron.schedule(cronExpr, async () => {
            try {
                console.log('🌅 [Cron Preview] Déclenchement du pré-rendu du message du jour...');
                await sendDailyMessagePreview(client);
            } catch (error) {
                console.error('❌ Erreur lors du déclenchement du pré-rendu du message du jour:', error.message);
            }
        }, { timezone });
        console.log(`   └─ 🌅 Daily Message Preview: actif (${cronExpr})`);
    }

    // 4. Cron pour la publication automatique du message validé à 09:00 (Paris)
    if (isDailyMessageEnabled && publishTask.enabled) {
        const cronExpr = publishTask.cron || '0 9 * * *';
        cron.schedule(cronExpr, async () => {
            try {
                console.log('📢 [Cron Publish] Déclenchement de la publication du message du jour...');
                await publishScheduledDailyMessage(client);
            } catch (error) {
                console.error('❌ Erreur lors de la publication du message du jour:', error.message);
            }
        }, { timezone });
        console.log(`   └─ 📢 Daily Message Publish: actif (${cronExpr})`);
    }

    // 5. Cron pour la validation et publication automatique à 11:00 (Paris) si non validé manuellement
    if (isDailyMessageEnabled && autoValidateTask.enabled) {
        const cronExpr = autoValidateTask.cron || '0 11 * * *';
        cron.schedule(cronExpr, async () => {
            try {
                console.log('🤖 [Cron AutoValidate] Vérification de la validation automatique du message du jour...');
                await autoValidateAndPublishDailyMessage(client);
            } catch (error) {
                console.error('❌ Erreur lors de la validation automatique du message du jour:', error.message);
            }
        }, { timezone });
        console.log(`   └─ 🤖 Daily Message AutoValidate: actif (${cronExpr})`);
    }

    console.log('✅ Planificateur de tâches initialisé avec succès.');
}

module.exports = {
    setupScheduledTasks,
    checkAndSendBumpReminders
};