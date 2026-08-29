/**
 * reminders.module.js — point d'entrée de la feature util_reminders
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const { RemindersRepository } = require('./services/reminders.repository.js');
const { ReminderService } = require('./services/reminder.service.js');
const { RemindersController } = require('./controllers/reminders.controller.js');
const { RemindersMessageListener } = require('./events/message-create.listener.js');
const { RemindersCommands } = require('./commands/remind-commands.js');

const defaults = require('./config/defaults.js');

featureRegistry.define('reminders', {
    defaults: { ...defaults, enabled: defaults.enabled ?? false },
    onEnable: async (guildId) => console.log(`⏰ [reminders] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [reminders] disabled on ${guildId}`)
});

class RemindersModule {
    constructor() {
        this._repo = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        this._repo = new RemindersRepository();
        const service = this._resolve(ReminderService);
        if (service) service.setRepo(this._repo);
        this._initialized = true;
    }

    _resolve(Class) {
        try {
            const { container } = require('../../core/index.js');
            if (container.has(Class)) return container.resolve(Class);
        } catch (err) {
            console.warn(`[RemindersModule] Erreur résolution ${Class?.name || 'classe'}:`, err.message);
        }
        return null;
    }
}

Module({
    providers: [
        RemindersRepository,
        ReminderService,
        RemindersModule
    ],
    controllers: [RemindersController],
    events: [RemindersMessageListener],
    commands: [RemindersCommands]
})(RemindersModule);

module.exports = { RemindersModule };
