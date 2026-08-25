const { Controller, Get, Post } = require('../../core/index.js');
const { BumpReminderService } = require('./bump-reminder.service.js');
const { saveModuleConfig, getConfig } = require('../../config/index.js');

class BumpReminderController {
    static inject = [BumpReminderService];

    constructor(service) {
        this.service = service;
    }

    async getStatus(req) {
        const guildId = req.query.guild_id || null;
        const data = await this.service.getBumpStatus(guildId);
        return { success: true, data };
    }

    async saveConfig(req) {
        try {
            const body = req.body || {};
            const currentFull = getConfig();
            const currentBump = currentFull.bump_reminders || {};

            const updatedBump = {
                ...currentBump,
                enabled: body.enabled !== undefined ? !!body.enabled : (currentBump.enabled !== false),
                channel_id: body.channel_id !== undefined ? String(body.channel_id) : (currentBump.channel_id || ''),
                role_id: body.role_id !== undefined ? String(body.role_id) : (currentBump.role_id || ''),
                reminder_cooldown_hours: body.reminder_cooldown_hours !== undefined ? Number(body.reminder_cooldown_hours) : (currentBump.reminder_cooldown_hours || 2),
                mention_here: body.mention_here !== undefined ? !!body.mention_here : (currentBump.mention_here !== false),
                messages: {
                    ...(currentBump.messages || {}),
                    title: body.messages?.title || currentBump.messages?.title || "⏰ C'est l'heure du Bump !",
                    description: body.messages?.description || currentBump.messages?.description || "2 heures se sont écoulées depuis le dernier bump !\n\nTapez </bump:947088344167366698> pour faire monter le serveur sur Disboard 🚀",
                    color: body.messages?.color || currentBump.messages?.color || "#f2c7ce"
                }
            };

            // Mettre à jour la section bump_reminders
            saveModuleConfig('bump_reminders', updatedBump);

            // Mettre à jour aussi scheduler.tasks.bump_reminders pour cohérence
            if (currentFull.scheduler?.tasks?.bump_reminders) {
                currentFull.scheduler.tasks.bump_reminders.enabled = updatedBump.enabled;
                currentFull.scheduler.tasks.bump_reminders.channel_id = updatedBump.channel_id;
                currentFull.scheduler.tasks.bump_reminders.role_id = updatedBump.role_id;
            }

            return {
                success: true,
                message: 'Configuration du rappel de bump sauvegardée avec succès.',
                data: updatedBump
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async remindNow(req) {
        const client = req.app?.get('discordClient');
        if (!client) {
            return { success: false, error: 'Client Discord non disponible' };
        }

        let lastBump = await this.service.repo.getLastBump();
        if (!lastBump) {
            // Créer un bump factice pour pouvoir tester le rappel immédiatement
            lastBump = {
                id: 999999,
                channel_id: this.service.getConfig().channel_id || 'test_channel',
                bumper_id: client.user?.id || '0',
                bumper_username: 'Test Manuelle Dashboard',
                bumped_at: new Date().toISOString()
            };
        }

        await this.service.sendBumpReminder(client, lastBump);
        return { success: true, message: 'Rappel de bump envoyé avec succès.' };
    }
}

Controller('/api/bump')(BumpReminderController);
Get('')(BumpReminderController.prototype, 'getStatus');
Get('/status')(BumpReminderController.prototype, 'getStatus');
Post('/config')(BumpReminderController.prototype, 'saveConfig');
Post('/remind-now')(BumpReminderController.prototype, 'remindNow');
Post('/test-reminder')(BumpReminderController.prototype, 'remindNow');

module.exports = {
    BumpReminderController
};
