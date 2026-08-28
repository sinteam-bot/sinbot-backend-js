/**
 * engagement-advanced.module.js — point d'entrée de la feature
 * Engagement avancé (Phase 11 : rappels + triggers + custom cmds)
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { EngagementAdvancedRepository } = require('./services/engagement.repository.js');
const { ReminderService } = require('./services/reminder.service.js');
const { WordTriggerService } = require('./services/word-trigger.service.js');
const { CustomCommandService } = require('./services/custom-command.service.js');
const { MessageCreateListener } = require('./events/message-create.listener.js');
const { ReminderCron } = require('./cron/reminder-cron.js');
const { EngagementAdvancedController } = require('./controllers/engagement.controller.js');
const { EngagementAdvancedCommands } = require('./commands/engagement-commands.js');

featureRegistry.define('engagement-advanced', {
    defaults,
    onEnable: async (guildId) => console.log(`📌 [engagement-advanced] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [engagement-advanced] disabled on ${guildId}`)
});

class EngagementAdvancedModule {
    constructor(reminder, cron) {
        this.reminder = reminder;
        this.cron = cron;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client) {
                this.reminder.setClient(client);
                this.cron.setClient(client);
            }
        } catch (err) {
            console.warn('[EngagementAdvancedModule] Erreur initialisation Client:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        EngagementAdvancedRepository,
        ReminderService,
        WordTriggerService,
        CustomCommandService,
        EngagementAdvancedModule
    ],
    controllers: [EngagementAdvancedController],
    events: [MessageCreateListener, ReminderCron],
    commands: [EngagementAdvancedCommands]
})(EngagementAdvancedModule);

module.exports = { EngagementAdvancedModule };
