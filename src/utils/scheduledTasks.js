const cron = require('node-cron');
const { getPendingBumpReminders, markBumpReminderSent } = require("../database.js");
const { sendDailyMessagePreview, publishScheduledDailyMessage } = require("./dailyMessageManager.js");

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
                        const userMentionInfo = userText ? ` (Dernier bump par <@${bump.user_id}>)` : '';
                        // await channel.send(`<@&1427703047534153872> **c'est l'heure de bumper Obsydian** <:Obsydemoncouverture:1488145689916473544> ${userMentionInfo}`);
                        const delay = ((parseInt(Date.parse(bump.bumped_at)) / 1000) + 7200) - Math.floor(Date.now() / 1000);
                        console.log(`[BUMP] bientôt 2 heures se sont écoulées depuis le bump (ID: ${bump.id}), rappel envoyé dans ${delay} secondes !`, bump.bumped_at);

                        setTimeout(async () => {
                            await channel.send(`<@&1427703047534153872> **c'est l'heure de bumper Obsydian** <:Obsydemoncouverture:1488145689916473544> ${userMentionInfo}`);
                            const heureParis = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
                            await console.log(`[BUMP] 2 heures se sont écoulées, le rappel a été envoyé à ${heureParis}!`)
                        }, delay * 1000);
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
    publishScheduledDailyMessage(client);

    // 2. Cron vérifiant toutes les minutes si un rappel de bump doit être envoyé
    cron.schedule('* * * * *', async () => {
        await checkAndSendBumpReminders(client);
    });

    // 3. Cron pour la génération et prévisualisation du message du jour à 19:00 (Paris)
    cron.schedule('0 19 * * *', async () => {
        try {
            console.log('🌅 [Cron 19:00] Déclenchement du pré-rendu du message du jour...');
            await sendDailyMessagePreview(client);
        } catch (error) {
            console.error('❌ Erreur lors du déclenchement du pré-rendu du message du jour (19:00):', error.message);
        }
    }, {
        timezone: "Europe/Paris"
    });

    // 4. Cron pour la publication automatique du message validé à 09:00 (Paris)
    cron.schedule('0 9 * * *', async () => {
        try {
            console.log('📢 [Cron 09:00] Déclenchement de la publication du message du jour...');
            await publishScheduledDailyMessage(client);
        } catch (error) {
            console.error('❌ Erreur lors de la publication du message du jour (09:00):', error.message);
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