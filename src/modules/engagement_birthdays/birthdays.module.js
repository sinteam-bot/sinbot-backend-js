/**
 * birthdays.module.js — point d'entrée de la feature Birthdays (Phase 7)
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { BirthdayRepository } = require('./services/birthday.repository.js');
const { BirthdayService } = require('./services/birthday.service.js');
const { GiftService } = require('./services/gift.service.js');
const { BirthdayAnnouncer } = require('./services/announcer.service.js');
const { BirthdaysController } = require('./controllers/birthdays.controller.js');
const { BirthdayCommands } = require('./commands/birthday-commands.js');

featureRegistry.define('birthdays', {
    defaults,
    onEnable: async (guildId) => console.log(`🎂 [birthdays] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [birthdays] disabled on ${guildId}`)
});

class BirthdaysModule {
    constructor(announcer) {
        this.announcer = announcer;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client && this.announcer) this.announcer.setClient(client);
        } catch (err) {
            console.warn('[BirthdaysModule] Erreur initialisation Client:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        BirthdayRepository,
        BirthdayService,
        GiftService,
        BirthdayAnnouncer,
        BirthdaysModule
    ],
    controllers: [BirthdaysController],
    commands: [BirthdayCommands]
})(BirthdaysModule);

module.exports = { BirthdaysModule };
