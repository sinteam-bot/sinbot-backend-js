/**
 * src/modules/util_localization/controllers/localization.controller.js
 *
 * Contrôleur REST pour la configuration de la langue.
 */

const { Controller, Get, Put } = require('../../../core/index.js');
const { i18n } = require('../../../core/i18n.js');

class LocalizationController {
    async get(req) {
        try {
            const guildId = req.query?.guild_id || process.env.GUILD_ID || 'default';
            const language = await i18n.getGuildLanguage(guildId);
            return { success: true, data: { guild_id: guildId, language } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async update(req) {
        try {
            const guildId = req.body?.guild_id || process.env.GUILD_ID || 'default';
            const language = req.body?.language || 'fr';
            const setLang = await i18n.setGuildLanguage(guildId, language);
            return { success: true, data: { guild_id: guildId, language: setLang } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/localization')(LocalizationController);
Get('')(LocalizationController.prototype, 'get');
Put('')(LocalizationController.prototype, 'update');

module.exports = { LocalizationController };
