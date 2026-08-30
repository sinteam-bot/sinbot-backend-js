/**
 * word-triggers.module.js — point d'entrée de la feature util_word_triggers
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const { WordTriggersRepository } = require('./services/word-triggers.repository.js');
const { WordTriggerService } = require('./services/word-trigger.service.js');
const { WordTriggersController } = require('./controllers/word-triggers.controller.js');
const { WordTriggersMessageListener } = require('./events/message-create.listener.js');
const { MemberRoleUpdateListener } = require('./events/member-role-update.listener.js');
const { WordTriggersCommands } = require('./commands/trigger-commands.js');

const defaults = require('./config/defaults.js');

featureRegistry.define('word_triggers', {
    defaults: { ...defaults, enabled: defaults.enabled ?? false },
    onEnable: async (guildId) => console.log(`💬 [word_triggers] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [word_triggers] disabled on ${guildId}`)
});

class WordTriggersModule {
    constructor() {
        this._repo = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        this._repo = new WordTriggersRepository();
        const service = this._resolve(WordTriggerService);
        if (service) service.setRepo(this._repo);
        this._initialized = true;
    }

    _resolve(Class) {
        try {
            const { container } = require('../../core/index.js');
            if (container.has(Class)) return container.resolve(Class);
        } catch (err) {
            console.warn(`[WordTriggersModule] Erreur résolution ${Class?.name || 'classe'}:`, err.message);
        }
        return null;
    }
}

Module({
    providers: [
        WordTriggersRepository,
        WordTriggerService,
        WordTriggersModule
    ],
    controllers: [WordTriggersController],
    events: [WordTriggersMessageListener, MemberRoleUpdateListener],
    commands: [WordTriggersCommands]
})(WordTriggersModule);

module.exports = { WordTriggersModule };
