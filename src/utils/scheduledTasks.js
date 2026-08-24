const cron = require('node-cron');
const { getParisHour } = require("./dateUtils.js");
const { config } = require("../config/index.js");
const { container } = require("../core/container.js");
const { BumpReminderService } = require("../modules/service_bump-reminder/bump-reminder.service.js");
const { DailyMessageService } = require("../modules/feature_daily-message/daily-message.service.js");

/**
 * Fonction de vérification et d'envoi des rappels de bump en attente
 */
async function checkAndSendBumpReminders(client) {
    try {
        const bumpService = container.resolve(BumpReminderService);
        await bumpService.checkAndSendReminders(client);
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

    // Si le bot démarre après 11h et que le message n'a pas encore été publié aujourd'hui
    if (isDailyMessageEnabled && autoValidateTask.enabled && currentHour >= 11) {
        console.log('⏰ [DailyMessage 11:00] Vérification de la validation/publication automatique...');
        const dailyService = container.resolve(DailyMessageService);
        dailyService.autoValidateAndPublish(client).catch(err => {
            console.error('❌ Erreur lors de l\'auto-validation au démarrage:', err.message);
        });
    }

    // 2. Cron pour les rappels de bump (par défaut toutes les minutes)
    if (bumpTask.enabled) {
        const cronExpr = bumpTask.cron || '* * * * *';
        cron.schedule(cronExpr, async () => {
            await checkAndSendBumpReminders(client);
        }, { timezone });
        console.log(`   └─ 🔔 Bump Reminders: actif (${cronExpr})`);
    }

    // 3. Cron pour l'envoi du pré-rendu à 21:00 (Paris)
    const previewTask = tasks.daily_preview ?? { enabled: true, cron: '0 21 * * *' };
    if (isDailyMessageEnabled && previewTask.enabled) {
        const cronExpr = previewTask.cron || '0 21 * * *';
        cron.schedule(cronExpr, async () => {
            try {
                console.log('🌙 [Cron Preview] Déclenchement du pré-rendu du message du jour...');
                const dailyService = container.resolve(DailyMessageService);
                await dailyService.sendPreview(client);
            } catch (error) {
                console.error('❌ Erreur lors du pré-rendu du message du jour:', error.message);
            }
        }, { timezone });
        console.log(`   └─ 🌅 Daily Message Preview: actif (${cronExpr})`);
    }

    // 4. Cron pour la publication programmée à 09:00 (Paris)
    const publishTask = tasks.daily_publish ?? { enabled: true, cron: '0 9 * * *' };
    if (isDailyMessageEnabled && publishTask.enabled) {
        const cronExpr = publishTask.cron || '0 9 * * *';
        cron.schedule(cronExpr, async () => {
            try {
                console.log('📢 [Cron Publish] Déclenchement de la publication du message du jour...');
                const dailyService = container.resolve(DailyMessageService);
                await dailyService.publishScheduled(client);
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
                const dailyService = container.resolve(DailyMessageService);
                await dailyService.autoValidateAndPublish(client);
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