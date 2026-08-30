/**
 * src/modules/util_forms/forms.module.js
 *
 * Module Formulaires & Réponses (Phase 14 G21).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { FormsRepository } = require('./services/forms.repository.js');
const { FormsService } = require('./services/forms.service.js');
const { FormCommands } = require('./commands/form.cmd.js');
const { FormsController } = require('./controllers/forms.controller.js');

featureRegistry.define('forms', {
    defaults,
    onEnable: async (guildId) => console.log(`📋 [forms] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [forms] disabled on ${guildId}`)
});

class FormsModule {}

Module({
    providers: [
        FormsRepository,
        FormsService,
        FormsModule
    ],
    controllers: [FormsController],
    commands: [FormCommands]
})(FormsModule);

module.exports = { FormsModule };
