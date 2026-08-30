/**
 * automod.module.js — point d'entrée de la feature AutoMod
 *
 * Déclare la feature dans le FeatureRegistry (Phase 0) et expose
 * tous les services / events / commands via le ModuleManager.
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { AutomodEngine } = require('./services/automod-engine.service.js');
const { Sanctions } = require('./services/sanctions.service.js');
const { ModLog } = require('./services/mod-log.service.js');
const { ScheduledPurgeRepository } = require('./services/scheduled-purge.repository.js');
const { ScheduledPurgeService } = require('./services/scheduled-purge.service.js');
const { AutomodMessageCreateListener } = require('./events/message-create.listener.js');
const { ModCommands } = require('./commands/mod-commands.js');
const { PurgeScheduleCommands } = require('./commands/purge-schedule.cmd.js');
const { AutomodController } = require('./controllers/automod.controller.js');

featureRegistry.define('automod', {
    defaults,
    onEnable: async (guildId) => {
        console.log(`🛡️ [automod] enabled on ${guildId}`);
    },
    onDisable: async (guildId) => {
        console.log(`💤 [automod] disabled on ${guildId}`);
    }
});

class AutoModModule {
    constructor(purgeService) {
        this.purgeService = purgeService;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client && this.purgeService) {
                this.purgeService.start(client);
            }
        } catch (err) {
            console.warn('[AutoModModule] Erreur init ScheduledPurge:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        AutomodEngine,
        Sanctions,
        ModLog,
        ScheduledPurgeRepository,
        ScheduledPurgeService,
        AutoModModule
    ],
    controllers: [AutomodController],
    events: [AutomodMessageCreateListener],
    commands: [ModCommands, PurgeScheduleCommands]
})(AutoModModule);

module.exports = { AutoModModule };
