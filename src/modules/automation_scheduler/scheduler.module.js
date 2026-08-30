/**
 * src/modules/automation_scheduler/scheduler.module.js
 *
 * Module Automation Scheduler (Phase 8 G03).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { SchedulerRepository } = require('./services/scheduler.repository.js');
const { SchedulerService } = require('./services/scheduler.service.js');
const { SchedulerController } = require('./controllers/scheduler.controller.js');
const { SchedulerCommands } = require('./commands/scheduler.cmd.js');

featureRegistry.define('scheduler', {
    defaults,
    onEnable: async (guildId) => console.log(`⏰ [scheduler] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [scheduler] disabled on ${guildId}`)
});

class SchedulerModule {
    constructor(service) {
        this.service = service;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client && this.service) {
                this.service.start(client);
            }
        } catch (err) {
            console.warn('[SchedulerModule] Erreur initialisation:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        SchedulerRepository,
        SchedulerService,
        SchedulerModule
    ],
    controllers: [SchedulerController],
    commands: [SchedulerCommands]
})(SchedulerModule);

module.exports = { SchedulerModule };
