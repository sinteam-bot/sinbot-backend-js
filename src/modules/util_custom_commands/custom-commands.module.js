/**
 * custom-commands.module.js — point d'entrée de la feature util_custom_commands
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const { CustomCommandsRepository } = require('./services/custom-commands.repository.js');
const { CustomCommandService } = require('./services/custom-command.service.js');
const { CustomCommandsController } = require('./controllers/custom-commands.controller.js');
const { CustomCommandsMessageListener } = require('./events/message-create.listener.js');
const { CustomCommandsCommands } = require('./commands/customcmd-commands.js');

const defaults = require('./config/defaults.js');

featureRegistry.define('custom_commands', {
    defaults: { ...defaults, enabled: defaults.enabled ?? false },
    onEnable: async (guildId) => console.log(`⚡ [custom_commands] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [custom_commands] disabled on ${guildId}`)
});

class CustomCommandsModule {
    constructor() {
        this._repo = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        this._repo = new CustomCommandsRepository();
        const service = this._resolve(CustomCommandService);
        if (service) service.setRepo(this._repo);
        this._initialized = true;
    }

    _resolve(Class) {
        try {
            const { container } = require('../../core/index.js');
            if (container.has(Class)) return container.resolve(Class);
        } catch (err) {
            console.warn(`[CustomCommandsModule] Erreur résolution ${Class?.name || 'classe'}:`, err.message);
        }
        return null;
    }
}

Module({
    providers: [
        CustomCommandsRepository,
        CustomCommandService,
        CustomCommandsModule
    ],
    controllers: [CustomCommandsController],
    events: [CustomCommandsMessageListener],
    commands: [CustomCommandsCommands]
})(CustomCommandsModule);

module.exports = { CustomCommandsModule };
