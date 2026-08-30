/**
 * src/modules/util_localization/localization.module.js
 *
 * Module Localisation & i18n (Phase 14 G34).
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { LanguageCommands } = require('./commands/language.cmd.js');
const { LocalizationController } = require('./controllers/localization.controller.js');

featureRegistry.define('localization', {
    defaults,
    onEnable: async (guildId) => console.log(`🌐 [localization] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [localization] disabled on ${guildId}`)
});

class LocalizationModule {}

Module({
    providers: [LocalizationModule],
    controllers: [LocalizationController],
    commands: [LanguageCommands]
})(LocalizationModule);

module.exports = { LocalizationModule };
